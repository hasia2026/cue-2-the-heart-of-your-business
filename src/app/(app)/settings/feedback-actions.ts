"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Message the builder — every signed-in role (even MEMBER) can send feature
// requests and issue reports. Stored in builder_feedback (migrated) and
// mirrored to audit_events so the trail is durable either way.

export async function sendBuilderFeedback(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const message = String(formData.get("message") ?? "").trim();
  const kind = String(formData.get("kind") ?? "FEATURE") === "ISSUE" ? "ISSUE" : "FEATURE";
  const page = String(formData.get("page") ?? "").trim().slice(0, 120) || null;

  if (!message) return { ok: false, error: "Write something first — what should CUE do, or what went wrong?" };
  if (message.length > 2000) return { ok: false, error: "Keep it under 2000 characters — the gist is enough." };

  try {
    await sql`
      insert into builder_feedback (organization_id, user_id, kind, message, page)
      values (${session.organizationId}, ${session.user.id}, ${kind}, ${message}, ${page})`;
  } catch {
    return { ok: false, error: "The feedback box isn't set up yet — try again in a minute." };
  }

  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "BUILDER_FEEDBACK",
    targetType: "BuilderFeedback",
    detail: `${kind.toLowerCase()} from ${session.user.email}: ${message.slice(0, 120)}`,
    metadata: { kind, page },
  });
  revalidatePath("/settings");
  return { ok: true };
}
