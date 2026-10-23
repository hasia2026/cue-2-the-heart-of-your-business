"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const STATUSES = ["NEW", "CALLED", "BOOKED", "NOT_INTERESTED"] as const;
export type ScanLeadStatus = (typeof STATUSES)[number];

/**
 * Owner pulls on public flyer-QR captures. scan_leads is org-less — these are
 * leads the CUE operator (HASI pilot outreach) generates, so the actions gate
 * on role, not on organization scope, and never accept status from the client
 * beyond the fixed set above.
 */
async function ownerGate() {
  const session = await requireSessionAction();
  if (session.role === "MEMBER" || session.role === "MANAGER") {
    return { session: null, error: "Owner or Admin access required" } as const;
  }
  // Mutations from non-app origins are rejected (CSRF hardening, same rule
  // the settings actions use).
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (origin && host && !new URL(origin).host.endsWith(host)) {
    return { session: null, error: "Cross-origin request refused" } as const;
  }
  return { session, error: null } as const;
}

export async function setScanLeadStatus(leadId: string, status: string) {
  const gate = await ownerGate();
  if (!gate.session) return { ok: false, error: gate.error };
  if (!(STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Invalid status" };
  const [row] = await sql`
    update scan_leads set status = ${status}, updated_at = now()
    where id = ${leadId}
    returning name, shop, status`;
  if (!row) return { ok: false, error: "Lead not found" };
  await logAudit({
    organizationId: gate.session.organizationId,
    actorType: "USER",
    actorId: gate.session.user.id,
    action: "SCAN_LEAD_STATUS",
    targetType: "ScanLead",
    targetId: leadId,
    detail: `${gate.session.user.name} set ${row.name} / ${row.shop} → ${status}`,
  });
  revalidatePath("/pipeline/scan-leads");
  return { ok: true, status: row.status };
}

export async function saveScanLeadNote(leadId: string, note: string) {
  const gate = await ownerGate();
  if (!gate.session) return { ok: false, error: gate.error };
  const [row] = await sql`
    update scan_leads set note = ${note.slice(0, 2000)}, updated_at = now()
    where id = ${leadId}
    returning name, shop`;
  if (!row) return { ok: false, error: "Lead not found" };
  await logAudit({
    organizationId: gate.session.organizationId,
    actorType: "USER",
    actorId: gate.session.user.id,
    action: "SCAN_LEAD_NOTE",
    targetType: "ScanLead",
    targetId: leadId,
    detail: `${gate.session.user.name} saved follow-up notes on ${row.name} / ${row.shop}`,
  });
  revalidatePath("/pipeline/scan-leads");
  return { ok: true };
}
