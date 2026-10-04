"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { gradeQuizSubmission, type QuizQuestion } from "@/lib/quiz";

// ─────────────────────────────────────────────────────────────
// Lessons & quizzes. Videos: either a URL (YouTube/Loom/Vimeo)
// or an uploaded file stored under /public/uploads. Quizzes are
// scored server-side; answers never reach the client.
// ─────────────────────────────────────────────────────────────

const QUIZ_JSON = z.array(
  z.discriminatedUnion("type", [
    // Single choice (classic radio) — back-compatible with the original format
    z.object({
      type: z.literal("SINGLE").optional().default("SINGLE"),
      q: z.string().min(1).max(400),
      options: z.array(z.string().min(1).max(200)).min(2).max(6),
      answerIndex: z.number().int().min(0).max(5),
    }),
    // Multi-select — all correct options must be checked
    z.object({
      type: z.literal("MULTI"),
      q: z.string().min(1).max(400),
      options: z.array(z.string().min(1).max(200)).min(3).max(8),
      answerIndexes: z.array(z.number().int().min(0).max(7)).min(1),
    }),
    // Free text — answered correctly if it includes ANY keyword (case-insensitive)
    z.object({
      type: z.literal("FREE"),
      q: z.string().min(1).max(400),
      keywords: z.array(z.string().min(1).max(80)).min(1).max(10),
      sampleAnswer: z.string().max(600).optional(),
    }),
  ])
);

function detectVideoKind(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YOUTUBE";
  if (u.includes("loom.com")) return "LOOM";
  if (u.includes("vimeo.com")) return "VIMEO";
  return "LINK";
}

export async function createLesson(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const moduleId = String(formData.get("moduleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const videoUrlRaw = String(formData.get("videoUrl") ?? "").trim();
  const videoFile = formData.get("videoFile") as File | null;
  const durationMin = parseInt(String(formData.get("durationMin") ?? ""), 10) || null;

  if (!moduleId || !title) throw new Error("Module and title are required");

  const mod = await prisma.trainingModule.findFirst({ where: { id: moduleId, organizationId: orgId } });
  if (!mod) throw new Error("Training module not found");

  let videoUrl: string | null = null;
  let videoKind: string | null = null;

  if (videoFile && videoFile.size > 0) {
    // Form-fallback path: small files only (server actions have a body
    // ceiling, and Vercel caps requests at ~4.5MB). Larger videos use
    // the signed direct-upload flow in TrainingClient instead.
    if (videoFile.size > 20 * 1024 * 1024) {
      throw new Error("Video is too large for direct form upload (20MB max) — cloud storage is used automatically for bigger files");
    }
    const { putObject } = await import("@/lib/storage");
    const stored = await putObject(
      orgId,
      "training",
      videoFile.name,
      Buffer.from(await videoFile.arrayBuffer()),
      videoFile.type || "video/mp4"
    );
    videoUrl = stored.url;
    videoKind = "UPLOAD";
  } else if (videoUrlRaw) {
    if (!/^https?:\/\//i.test(videoUrlRaw)) throw new Error("Video URL must start with http(s)://");
    videoUrl = videoUrlRaw;
    // Direct-to-storage uploads arrive as URLs but are still local files conceptually.
    videoKind = String(formData.get("directUpload") ?? "") === "1" ? "UPLOAD" : detectVideoKind(videoUrlRaw);
  }

  const count = await prisma.trainingLesson.count({ where: { moduleId } });
  const lesson = await prisma.trainingLesson.create({
    data: { organizationId: orgId, moduleId, title, content: content || null, videoUrl, videoKind, durationMin, sort: count },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "LESSON_CREATED",
    targetType: "TrainingLesson",
    targetId: lesson.id,
    detail: `${title} added to ${mod.title}${videoKind ? ` (${videoKind})` : ""}`,
  });

  revalidatePath("/expand");
  return { ok: true, lessonId: lesson.id };
}

export async function attachQuiz(lessonId: string, questionsJson: string, passingPct = 80) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const lesson = await prisma.trainingLesson.findFirst({ where: { id: lessonId, organizationId: orgId } });
  if (!lesson) throw new Error("Lesson not found");

  let parsed: unknown;
  try { parsed = JSON.parse(questionsJson); } catch { throw new Error("Quiz JSON invalid"); }
  const qs = QUIZ_JSON.parse(parsed);
  if (qs.length === 0) throw new Error("Add at least one question");

  await prisma.lessonQuiz.upsert({
    where: { lessonId },
    create: { lessonId, questions: JSON.stringify(qs), passingPct },
    update: { questions: JSON.stringify(qs), passingPct },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "QUIZ_ATTACHED",
    targetType: "TrainingLesson",
    targetId: lessonId,
    detail: `${qs.length}-question quiz on "${lesson.title}" (pass: ${passingPct}%)`,
  });

  revalidatePath("/expand");
  return { ok: true, count: qs.length };
}

/** Grade a quiz submission server-side. Returns pass/fail + score.
 *  Submission shape per question: { choice?: number, choices?: number[], text?: string } */
export async function submitQuiz(
  lessonId: string,
  answersIn: (number | number[] | string | undefined)[]
) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const quiz = await prisma.lessonQuiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new Error("No quiz on this lesson");

  const employee = await prisma.employee.findFirst({ where: { organizationId: orgId } });
  const questions = JSON.parse(quiz.questions) as QuizQuestion[];
  const { correct, score, review } = gradeQuizSubmission(questions, answersIn);
  const passed = score >= quiz.passingPct;

  const existing = await prisma.lessonProgress.findUnique({
    where: { lessonId_employeeId: { lessonId, employeeId: employee?.id ?? "" } },
  });

  if (employee) {
    if (existing) {
      await prisma.lessonProgress.update({
        where: { id: existing.id },
        data: {
          quizScore: Math.max(existing.quizScore ?? 0, score),
          status: passed || existing.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
          completedAt: passed ? new Date() : existing.completedAt,
        },
      });
    } else {
      await prisma.lessonProgress.create({
        data: {
          organizationId: orgId,
          lessonId,
          employeeId: employee.id,
          quizScore: score,
          status: passed ? "COMPLETED" : "IN_PROGRESS",
          completedAt: passed ? new Date() : null,
        },
      });
    }
  }

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: passed ? "QUIZ_PASSED" : "QUIZ_ATTEMPTED",
    targetType: "TrainingLesson",
    targetId: lessonId,
    detail: `Scored ${score}% (pass: ${quiz.passingPct}%)`,
  });

  // Correct answers are revealed only after submission (review comes from gradeQuizSubmission)
  return { ok: true, score, passed, review };
}

export async function markLessonComplete(lessonId: string) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const employee = await prisma.employee.findFirst({ where: { organizationId: orgId } });
  if (!employee) return { ok: false };

  await prisma.lessonProgress.upsert({
    where: { lessonId_employeeId: { lessonId, employeeId: employee.id } },
    create: { organizationId: orgId, lessonId, employeeId: employee.id, status: "COMPLETED", completedAt: new Date() },
    update: { status: "COMPLETED", completedAt: new Date() },
  });

  revalidatePath("/expand");
  return { ok: true };
}
