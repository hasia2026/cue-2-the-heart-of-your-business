"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Day-of completion on multi-visit jobs — the HCP ask: "close out today's
// work without affecting the status of the next scheduled visit on the same
// job." Because each appointment carries its own status, today's visit can
// be COMPLETED while the follow-up stays SCHEDULED — no calendar confusion,
// no daily-report noise. Org-scoped + audited like every other action.

export async function completeVisit(
  apptId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Members can't complete visits." };
  }
  const [appt] = await sql`
    select id, title, status, customer_id from appointments
    where id = ${apptId} and organization_id = ${session.organizationId}`;
  if (!appt) return { ok: false, error: "Visit not in your organization." };
  if (appt.status !== "SCHEDULED") {
    return { ok: false, error: `Visit is already ${appt.status}.` };
  }
  await sql`update appointments set status = 'COMPLETED' where id = ${appt.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "VISIT_COMPLETED",
    targetType: "Appointment",
    targetId: appt.id,
    detail: `"${appt.title}" marked done today (day-of completion; later visits unaffected)`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function noShowVisit(
  apptId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Members can't mark no-shows." };
  }
  const [appt] = await sql`
    select id, title, status from appointments
    where id = ${apptId} and organization_id = ${session.organizationId}`;
  if (!appt) return { ok: false, error: "Visit not in your organization." };
  if (appt.status !== "SCHEDULED") {
    return { ok: false, error: `Visit is already ${appt.status}.` };
  }
  await sql`update appointments set status = 'NO_SHOW' where id = ${appt.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "VISIT_NO_SHOW",
    targetType: "Appointment",
    targetId: appt.id,
    detail: `"${appt.title}" marked no-show`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}
