"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Service-type labels on leads and deals — the "how many diagnostics vs.
// upgrades vs. panel swaps" tracking ask. Managers set the label directly
// from Pipeline; the free-text keeps each org's own taxonomy (with a datalist
// of common options) instead of a hardcoded enum.

async function canLabel(role: string): Promise<boolean> {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export async function setLeadServiceType(
  leadId: string,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canLabel(session.role)) return { ok: false, error: "Only owners, admins and managers can label lead types." };
  const clean = value.trim().slice(0, 60);
  const [lead] = await sql`select id, service_type from leads where id = ${leadId} and organization_id = ${session.organizationId}`;
  if (!lead) return { ok: false, error: "Lead not in your organization." };
  await sql`update leads set service_type = ${clean || null} where id = ${lead.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "LEAD_TYPE_SET",
    targetType: "Lead",
    targetId: lead.id,
    detail: `type ${lead.service_type ?? "∅"} → ${clean || "∅"}`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function setDealServiceType(
  dealId: string,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canLabel(session.role)) return { ok: false, error: "Only owners, admins and managers can label deal types." };
  const clean = value.trim().slice(0, 60);
  const [deal] = await sql`select id, service_type from deals where id = ${dealId} and organization_id = ${session.organizationId}`;
  if (!deal) return { ok: false, error: "Deal not in your organization." };
  await sql`update deals set service_type = ${clean || null} where id = ${deal.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "DEAL_TYPE_SET",
    targetType: "Deal",
    targetId: deal.id,
    detail: `type ${deal.service_type ?? "∅"} → ${clean || "∅"}`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}
