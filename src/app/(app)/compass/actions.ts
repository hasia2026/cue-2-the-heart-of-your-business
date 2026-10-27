"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/** The questionnaire schema lives in compass/questions.ts — the action trusts
 *  only question ids present there, never raw form names. */
import { QUESTIONS, isQuestionId } from "./questions";

async function requireWriter() {
  const session = await requireSession();
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can edit the executive library.");
  return session;
}

/**
 * Upsert answers for one question at a time — every textarea saves its own
 * row, so filling half the questionnaire now still keeps what you wrote.
 */
export async function saveLibraryAnswer(formData: FormData): Promise<void> {
  const session = await requireWriter();
  const orgId = session.organizationId;
  const q = String(formData.get("question") ?? "");
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 4000);
  if (!isQuestionId(q)) throw new Error("Unknown questionnaire item.");

  await sql`
    insert into business_library (organization_id, question, answer, updated_at)
    values (${orgId}, ${q}, ${answer}, now())
    on conflict (organization_id, question) do update set
      answer = excluded.answer, updated_at = now()`;

  if (answer) {
    await logAudit({
      organizationId: orgId,
      actorId: session.user.id,
      action: "LIBRARY_ANSWER_SAVED",
      targetType: "BusinessLibrary",
      targetId: q,
      detail: "Executive library answer updated",
    });
  } else {
    await sql`delete from business_library where organization_id = ${orgId} and question = ${q}`;
  }
  revalidatePath("/compass");
}

export async function saveLibrarySection(formData: FormData): Promise<void> {
  const session = await requireWriter();
  const orgId = session.organizationId;
  const saved: string[] = [];
  for (const q of QUESTIONS) {
    const raw = String(formData.get(q.id) ?? "");
    if (!formData.has(q.id)) continue; // only the section that was submitted
    const answer = raw.trim().slice(0, 4000);
    await sql`
      insert into business_library (organization_id, question, answer, updated_at)
      values (${orgId}, ${q.id}, ${answer}, now())
      on conflict (organization_id, question) do update set
        answer = excluded.answer, updated_at = now()`;
    if (!answer) {
      await sql`delete from business_library where organization_id = ${orgId} and question = ${q.id} and answer = ''`;
    }
    saved.push(q.id);
  }
  if (saved.length) {
    await logAudit({
      organizationId: orgId,
      actorId: session.user.id,
      action: "LIBRARY_SECTION_SAVED",
      targetType: "BusinessLibrary",
      detail: `Executive library updated (${saved.length} items)`,
    });
  }
  revalidatePath("/compass");
}
