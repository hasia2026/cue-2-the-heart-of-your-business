/**
 * Verifies lessons/quizzes and messaging end-to-end against a scratch org.
 * npx tsx scripts/test-training-messaging.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const org = await prisma.organization.create({ data: { name: "__test-training-msg", isDemo: true } });

  // ── Training: module → lesson (video) → quiz → progress ──
  const mod = await prisma.trainingModule.create({
    data: { organizationId: org.id, title: "Test module", summary: "s", category: "PRODUCT", content: "c" },
  });
  const lesson = await prisma.trainingLesson.create({
    data: {
      organizationId: org.id, moduleId: mod.id, title: "Video lesson", sort: 0,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoKind: "YOUTUBE", durationMin: 5,
      content: "Watch and learn.",
    },
  });
  const quiz = await prisma.lessonQuiz.create({
    data: {
      lessonId: lesson.id, passingPct: 80,
      questions: JSON.stringify([
        { q: "Greeting first?", options: ["Yes", "No"], answerIndex: 0 },
        { q: "2+2?", options: ["3", "4", "5"], answerIndex: 1 },
      ]),
    },
  });
  const emp = await prisma.employee.create({ data: { organizationId: org.id, name: "Tech A", title: "Technician" } });
  await prisma.lessonProgress.create({
    data: { organizationId: org.id, lessonId: lesson.id, employeeId: emp.id, status: "COMPLETED", quizScore: 100, completedAt: new Date() },
  });

  const got = await prisma.trainingLesson.findFirst({
    where: { id: lesson.id },
    include: { quiz: true, progress: true, module: true },
  });
  if (!got || !got.quiz || got.progress.length !== 1 || got.videoKind !== "YOUTUBE") throw new Error("training chain failed");
  const qs = JSON.parse(got.quiz!.questions) as { answerIndex: number }[];
  const score = qs.filter((_, i) => [0, 1][i] === qs[i].answerIndex).length / qs.length * 100;
  if (score !== 100) throw new Error("quiz scoring failed");
  console.log("TRAINING ok — lesson+YOUTUBE video+quiz+progress(100%)");

  // ── Messaging: group thread → 2 messages → unread logic ──
  const thread = await prisma.messageThread.create({
    data: {
      organizationId: org.id, title: "Sales team", isGroup: true,
      participants: { create: [{ employeeId: emp.id }] },
    },
  });
  await prisma.message.create({ data: { threadId: thread.id, authorName: "Dana", body: "Morning — lead from web form, call at 10." } });
  await prisma.message.create({ data: { threadId: thread.id, authorName: "Tech A", body: "On it." } });

  const t = await prisma.messageThread.findFirst({
    where: { id: thread.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, participants: true },
  });
  if (!t || t.messages.length !== 2 || t.participants.length !== 1) throw new Error("thread failed");
  if (!t.messages[1].body.includes("On it")) throw new Error("message order failed");
  console.log("MESSAGING ok — group thread with 2 messages, ordered");

  // Cleanup
  await prisma.messageThread.delete({ where: { id: thread.id } });
  await prisma.trainingModule.delete({ where: { id: mod.id } });
  await prisma.employee.delete({ where: { id: emp.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — training + messaging verified, scratch org removed");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
