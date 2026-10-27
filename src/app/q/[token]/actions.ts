"use server";

import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

/**
 * Write-once decision. Email clients that prefetch links, double clicks and
 * pockets-with-two-tabs all resolve to the first reply — later attempts show
 * what was recorded and never overwrite. The `website` field is a honeypot:
 * bots fill it, humans never see it, and a filled row is dropped silently.
 */
export async function decideQuote(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const choice = String(formData.get("choice") ?? "");
  const website = String(formData.get("website") ?? "");
  if (website.trim()) return; // bot — acts like nothing happened

  const [row] = await sql`
    select id, organization_id, decided, title, customer_id
    from quote_responses where token = ${token}`;
  if (!row) return; // unknown token — page below shows "not found"
  if (row.decided) return; // already decided — never overwrite

  const decided = choice.startsWith("o-") ? choice.slice(2) : choice === "DECLINE" ? "DECLINE" : "";
  if (!decided) return;
  const noteName = choice.startsWith("o-") ? `note-${choice.slice(2)}` : "note-DECLINE";
  const noteRaw = String(formData.get(noteName) ?? "").trim();

  await sql`
    update quote_responses
    set decided = ${decided}, decided_at = now(), response_note = ${noteRaw ? noteRaw.slice(0, 500) : null}
    where id = ${row.id} and decided is null`;

  await logAudit({
    organizationId: String(row.organization_id),
    actorType: "SYSTEM",
    action: "QUOTE_DECISION_RECORDED",
    targetType: "Quote",
    targetId: String(row.id),
    detail: `Customer reply on “${String(row.title)}”: ${decided === "DECLINE" ? "declined" : `accepted option ${decided}`}${noteRaw ? " — with a note" : ""}.`,
    metadata: { token, choice, note: noteRaw || null },
  });
}
