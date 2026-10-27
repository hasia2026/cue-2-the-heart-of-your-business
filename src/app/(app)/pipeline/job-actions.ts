"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const VALID_APPT_KINDS = ["TEST_DRIVE", "SERVICE", "DELIVERY", "MEETING"] as const;

function parseMoney(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseScope(raw: FormDataEntryValue | null): string | null {
  return raw ? String(raw).trim().slice(0, 4000) || null : null;
}

/** Checklist is typed "one item per line": every nonempty line becomes an
 *  unticked item. Caps at 30 items so a paste can't explode a row. */
function parseChecklist(raw: FormDataEntryValue | null): { label: string; done: boolean }[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((label) => ({ label: label.slice(0, 200), done: false }));
}

/**
 * Quick add from Pipeline: a job or estimate for an EXISTING customer in one
 * row. Toni Stone's ask: when you're standing in a new job/estimate form,
 * typing the customer's new address should save — not bounce you through a
 * separate customer-edit detour. The address field therefore upserts
 * customers.address whenever it is filled (blank leaves it untouched),
 * an optional street visit creates an appointment, and the job itself lands
 * as an open service order the pipeline and billing flow already understand.
 */
export async function addJobOrEstimate(formData: FormData) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") return { ok: false, error: "Owner, Admin or Manager access required" };
  const orgId = session.organizationId;

  const customerId = String(formData.get("customerId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const amount = parseMoney(formData.get("amount"));
  const serviceType = String(formData.get("serviceType") ?? "").trim().slice(0, 60) || null;
  const address = String(formData.get("address") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim().slice(0, 80) || null;
  const when = String(formData.get("when") ?? "").trim(); // datetime-local
  const apptKind = VALID_APPT_KINDS.includes(formData.get("apptKind") as (typeof VALID_APPT_KINDS)[number])
    ? (formData.get("apptKind") as (typeof VALID_APPT_KINDS)[number])
    : "SERVICE";

  if (!customerId || !title) return { ok: false, error: "Pick a customer and name the job." };
  if (amount === null) return { ok: false, error: "Enter the job value ($)." };
  const whenDate = when ? new Date(when) : null;
  if (when && (whenDate === null || Number.isNaN(whenDate.getTime()))) {
    return { ok: false, error: "Visit date isn't readable — pick it again." };
  }

  const [customer] = await sql`
    select id, name, address from customers
    where id = ${customerId} and organization_id = ${orgId}`;
  if (!customer) return { ok: false, error: "Customer not found." };

  // Multi-property fix: the typed address is the PROPERTY this job services.
  // It lives on the job (service_orders.property_address) — it never overwrites
  // a customer's existing primary address, so property 30 doesn't clobber
  // property 1. It only seeds the account address when the customer has none.
  if (customer.address == null && address) {
    await sql`update customers set address = ${address} where id = ${customerId}`;
  }

  let order: { id: string; title: string } | undefined;
  try {
    const rows = await sql`
      insert into service_orders (organization_id, customer_id, title, amount, status, service_type, scope, checklist, property_address)
      values (${orgId}, ${customerId}, ${title.slice(0, 160)}, ${amount.toFixed(2)}, 'OPEN', ${serviceType},
              ${parseScope(formData.get("scope"))}, ${sql.json(parseChecklist(formData.get("checklist")))}, ${address || null})
      returning id, title`;
    order = rows[0] as unknown as { id: string; title: string };
  } catch {
    order = undefined;
  }
  if (!order) return { ok: false, error: "Could not create the job — try again." };

  let visit: string | null = null;
  if (whenDate && !Number.isNaN(whenDate.getTime())) {
    const [appt] = await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for)
      values (${orgId}, ${customerId}, ${`Visit — ${title.slice(0, 140)}`}, ${apptKind}, ${whenDate.toISOString()})
      returning scheduled_for`;
    visit = appt?.scheduled_for ? new Date(appt.scheduled_for).toISOString() : null;
  }

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "JOB_QUICK_ADDED",
    targetType: "ServiceOrder",
    targetId: order.id,
    detail: `${session.user.name} added job "${order.title}" for ${customer.name} at ${address || "the customer's primary address"} ($${amount.toFixed(2)})${visit ? " + visit scheduled" : ""}.`,
    metadata: { customerId, property: address || null, when: when || null },
  });

  revalidatePath("/pipeline");
  revalidatePath("/pipeline/unscheduled");
  return { ok: true, number: String(order.id), visit };
}type CheckItem = { label: string; done: boolean };




/** Flip one checklist item's done flag. Indexed by position: checklists are
 *  small and owner-owned, and labels aren't unique keys. */
export async function toggleChecklistItem(
  jobId: string,
  index: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const [job] = await sql`
    select id, title, checklist from service_orders
    where id = ${jobId} and organization_id = ${session.organizationId}`;
  if (!job) return { ok: false, error: "Job not in your organization." };
  const items = (Array.isArray(job.checklist) ? job.checklist : []) as CheckItem[];
  if (index < 0 || index >= items.length) return { ok: false, error: "No such item." };
  items[index] = { ...items[index], done: !items[index].done };
  await sql`update service_orders set checklist = ${sql.json(items)} where id = ${jobId}`;
  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "JOB_CHECKLIST_TOGGLE",
    targetType: "ServiceOrder",
    targetId: jobId,
    detail: `${session.user.name} ${items[index].done ? "checked off" : "reopened"} "${items[index].label}" on "${job.title}".`,
  });
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/unscheduled");
  return { ok: true };
}

/** Append one checklist item to an existing job (from the job row itself —
 *  no need to hunt down a separate edit screen). */
export async function addChecklistItem(
  jobId: string,
  label: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const clean = label.trim().slice(0, 200);
  if (!clean) return { ok: false, error: "Type the item first." };
  const [job] = await sql`
    select id, title, checklist from service_orders
    where id = ${jobId} and organization_id = ${session.organizationId}`;
  if (!job) return { ok: false, error: "Job not in your organization." };
  const items = ((Array.isArray(job.checklist) ? job.checklist : []) as CheckItem[]).slice(0, 29);
  items.push({ label: clean, done: false });
  await sql`update service_orders set checklist = ${sql.json(items)} where id = ${jobId}`;
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/unscheduled");
  return { ok: true };
}

/** Overwrite a job's scope and/or checklist from the inline editor. Passing an
 *  empty checklist body clears the list (an explicit customer of the field). */
export async function saveJobScopeChecklist(
  jobId: string,
  scope: string,
  checklistText: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const [job] = await sql`
    select id from service_orders where id = ${jobId} and organization_id = ${session.organizationId}`;
  if (!job) return { ok: false, error: "Job not in your organization." };
  const items = checklistText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((label) => ({ label: label.slice(0, 200), done: false }));
  await sql`
    update service_orders
    set scope = ${scope.trim().slice(0, 4000) || null}, checklist = ${sql.json(items)}
    where id = ${jobId}`;
  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "JOB_SCOPE_UPDATED",
    targetType: "ServiceOrder",
    targetId: jobId,
    detail: `${session.user.name} updated the scope/checklist on "${job.title ?? "job"}" (${items.length} checklist item${items.length === 1 ? "" : "s"}).`,
  });
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/unscheduled");
  return { ok: true };
}
