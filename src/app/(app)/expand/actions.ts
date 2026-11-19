"use server";

import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKS = ["auto", "service", "salon"];
const MODULE_CATEGORIES = new Set(["PROCESS", "CUSTOMER", "PRODUCT", "SAFETY", "ONBOARDING"]);

function parseQuiz(fd: FormData): { q: string; choices: string[]; answer: number }[] {
  const quiz: { q: string; choices: string[]; answer: number }[] = [];
  for (const i of [1, 2, 3]) {
    const q = String(fd.get(`q${i}`) ?? "").trim();
    const choices = String(fd.get(`ch${i}`) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const answer = Number(fd.get(`a${i}`) ?? 0);
    if (q && choices.length >= 2 && answer >= 1 && answer <= choices.length) {
      quiz.push({ q, choices, answer });
    }
  }
  return quiz;
}

export async function setLessonDone(fd: FormData): Promise<void> {
  const session = await requireSession();
  const track = String(fd.get("track") ?? "");
  const lesson = Number(fd.get("lesson") ?? 0);
  const done = String(fd.get("done") ?? "1") === "1";
  if (!TRACKS.includes(track) || ![1, 2, 3].includes(lesson)) return;
  if (done) {
    await sql`
      insert into academy_progress (organization_id, user_id, track, lesson)
      values (${session.organizationId}, ${session.user.id}, ${track}, ${lesson})
      on conflict (organization_id, user_id, track, lesson) do nothing`;
  } else {
    await sql`
      delete from academy_progress
      where organization_id = ${session.organizationId} and user_id = ${session.user.id}
        and track = ${track} and lesson = ${lesson}`;
  }
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
}

export async function assignTrack(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") return;
  const orgId = session.organizationId;
  const track = String(fd.get("track") ?? "");
  const userId = String(fd.get("userId") ?? "");
  if (!TRACKS.includes(track) || !UUID_RE.test(userId)) return;
  await sql`
    insert into academy_assignments (organization_id, user_id, track, assigned_by)
    values (${orgId}, ${userId}, ${track}, ${session.user.id})
    on conflict (organization_id, user_id, track) do nothing`;
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
}

export async function unassignTrack(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") return;
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) return;
  await sql`delete from academy_assignments where id = ${id} and organization_id = ${session.organizationId}`;
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
}

export async function importTraining(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (session.role !== "OWNER" && session.role !== "ADMIN") return;
  const orgId = session.organizationId;
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return;
  const category = String(fd.get("category") ?? "PROCESS");
  const videoUrl = String(fd.get("videoUrl") ?? "").trim() || null;
  const content = String(fd.get("content") ?? "").trim();
  if (!videoUrl && !content) return;

  const quiz = parseQuiz(fd);

  await sql`
    insert into training_modules (organization_id, title, summary, category, source, content_url, content, quiz, created_by)
    values (${orgId}, ${title}, ${(content || title).slice(0, 140)}, ${category}, 'IMPORTED', ${videoUrl}, ${content || title},
      ${JSON.stringify(quiz)}::jsonb, ${session.user.id})`;
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
}

function canManageModules(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function updateTraining(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!canManageModules(session.role)) return;
  const orgId = session.organizationId;
  const moduleId = String(fd.get("moduleId") ?? "");
  if (!UUID_RE.test(moduleId)) return;
  const title = String(fd.get("title") ?? "").trim();
  const category = String(fd.get("category") ?? "PROCESS");
  const videoUrl = String(fd.get("videoUrl") ?? "").trim() || null;
  const content = String(fd.get("content") ?? "").trim();
  if (!title || !MODULE_CATEGORIES.has(category) || (!videoUrl && !content)) return;

  const [module] = await sql`select id, title from training_modules where id = ${moduleId} and organization_id = ${orgId}`;
  if (!module) return;
  const quiz = parseQuiz(fd);

  await sql`
    update training_modules
    set title = ${title}, summary = ${(content || title).slice(0, 140)}, category = ${category},
        content_url = ${videoUrl}, content = ${content || title}, quiz = ${JSON.stringify(quiz)}::jsonb
    where id = ${module.id} and organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "TRAINING_UPDATED", targetType: "TrainingModule", targetId: String(module.id),
    detail: `"${title}" updated`,
  });
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
  revalidatePath("/people");
}

export async function deleteTraining(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (!canManageModules(session.role)) return;
  const orgId = session.organizationId;
  const moduleId = String(fd.get("moduleId") ?? "");
  if (!UUID_RE.test(moduleId)) return;

  const [module] = await sql`select id, title from training_modules where id = ${moduleId} and organization_id = ${orgId}`;
  if (!module) return;
  await sql`delete from training_modules where id = ${module.id} and organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "TRAINING_DELETED", targetType: "TrainingModule", targetId: String(module.id),
    detail: `"${module.title}" deleted`,
  });
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
  revalidatePath("/people");
}

export async function recordAttempt(fd: FormData): Promise<{ score: number; total: number }> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const moduleId = String(fd.get("moduleId") ?? "");
  if (!UUID_RE.test(moduleId)) return { score: 0, total: 0 };
  let answers: number[] = [];
  try {
    answers = JSON.parse(String(fd.get("answers") ?? "[]")) as number[];
  } catch {
    answers = [];
  }
  const [m] = await sql`select quiz from training_modules where id = ${moduleId} and organization_id = ${orgId}`;
  const quiz = ((m?.quiz as unknown) ?? []) as { answer: number }[];
  const total = quiz.length;
  let score = 0;
  quiz.forEach((q, i) => {
    if (answers[i] === q.answer) score += 1;
  });
  await sql`insert into training_attempts (organization_id, module_id, user_id, score, total)
    values (${orgId}, ${moduleId}, ${session.user.id}, ${score}, ${total})`;
  revalidatePath("/expand");
  revalidatePath("/expand/academy");
  revalidatePath("/expand/training-library");
  return { score, total };
}
