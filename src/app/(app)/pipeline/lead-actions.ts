"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Per-lead follow-up SLA — sets/updates the next-contact deadline and logs a
// contact. Overdue leads turn red on Pipeline so "estimate follow-up
// tracking" is visible at a glance, not buried in reports.

export async function setLeadNextAction(
  leadId: string,
  when: string | null
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Members can't set follow-up deadlines." };
  }
  const [lead] = await sql`
    select id, name from leads where id = ${leadId} and organization_id = ${session.organizationId}`;
  if (!lead) return { ok: false, error: "Lead not in your organization." };
  const whenDate = when ? new Date(when) : null;
  if (when && (Number.isNaN(whenDate!.getTime()) || whenDate!.getTime() < Date.now() - 864e5)) {
    return { ok: false, error: "Pick a future date for the follow-up." };
  }
  await sql`update leads set next_action_at = ${whenDate} where id = ${lead.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "LEAD_FOLLOWUP_SET",
    targetType: "Lead",
    targetId: lead.id,
    detail: `"${lead.name}" follow-up ${whenDate ? `set for ${whenDate.toISOString().slice(0, 10)}` : "cleared"}`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function logLeadContact(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const [lead] = await sql`
    select id, name, next_action_at from leads where id = ${leadId} and organization_id = ${session.organizationId}`;
  if (!lead) return { ok: false, error: "Lead not in your organization." };
  await sql`
    update leads set last_contact_at = now(), next_action_at = null where id = ${lead.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "LEAD_CONTACTED",
    targetType: "Lead",
    targetId: lead.id,
    detail: `"${lead.name}" contacted — follow-up done${lead.next_action_at ? `, SLA was ${new Date(lead.next_action_at).toISOString().slice(0, 10)}` : ""}`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}
