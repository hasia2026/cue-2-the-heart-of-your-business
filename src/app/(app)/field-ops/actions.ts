"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { draftInvoiceForOrder } from "@/lib/billing";
import { ensureAppointmentConfirmation } from "@/lib/appointment-confirmations";
import { sendAppointmentConfirmation } from "@/lib/appointment-messaging";

const RULE_KEYS = new Set(["arrival_window", "confirm_24h", "deposit_new_customer", "no_show_fee"]);
const WRITERS = new Set(["OWNER", "ADMIN", "MANAGER"]);

const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

/** Record an explicit staff confirmation in the durable confirmation record. */
export async function confirmAppointment(
  appointmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't confirm visits." };

  const [appointment] = await sql`
    select id, title, status from appointments
    where id = ${appointmentId} and organization_id = ${session.organizationId}`;
  if (!appointment) return { ok: false, error: "Visit not in your workspace." };
  if (appointment.status !== "SCHEDULED") return { ok: false, error: "Only scheduled visits can be confirmed." };
  const confirmation = await ensureAppointmentConfirmation(session.organizationId, appointment.id);
  if (!confirmation) return { ok: false, error: "Confirmation record could not be created." };
  if (confirmation.confirmedAt) {
    revalidatePath("/field-ops");
    return { ok: true };
  }

  await sql.begin(async (tx) => {
    await tx`
      update appointment_confirmations
      set status = 'CONFIRMED', method = 'STAFF', confirmed_at = now(),
          confirmed_by = ${session.user.id}, updated_at = now()
      where id = ${confirmation.id} and confirmed_at is null`;
    await tx`
      update appointments set confirmed_at = now()
      where id = ${appointment.id} and organization_id = ${session.organizationId}`;
  });
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "APPOINTMENT_CONFIRMED",
    targetType: "Appointment",
    targetId: appointment.id,
    detail: `"${appointment.title}" marked confirmed by ${session.user.name}`,
  });
  revalidatePath("/field-ops");
  return { ok: true };
}

/** Send a customer-facing visit confirmation, then record it as confirmed. */
export async function sendVisitConfirmation(
  appointmentId: string,
): Promise<{ ok: boolean; channel?: "WHATSAPP" | "EMAIL"; error?: string; already?: boolean; link?: string }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't send visit confirmations." };

  const result = await sendAppointmentConfirmation(session.organizationId, appointmentId, {
    actorType: "USER",
    actorId: session.user.id,
    actorName: session.user.name,
    source: "MANUAL",
  });
  if (result.ok || result.already) {
    revalidatePath("/field-ops");
    revalidatePath("/pipeline");
  }
  return result;
}

/** Draft only — the invoice is never sent from Field Ops. */
export async function draftFieldOpsInvoice(
  orderId: string,
): Promise<{ ok: boolean; number?: string; error?: string; reason?: string }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't draft invoices." };

  const result = await draftInvoiceForOrder(session.organizationId, {
    serviceOrderId: orderId,
    source: "MANUAL",
    actorType: "USER",
    actorId: session.user.id,
  });
  if (result.ok) {
    revalidatePath("/field-ops");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
  }
  return result;
}

/** One follow-up task for an overdue invoice or a stale lead. */
export async function createFieldOpsTask(
  kind: "INVOICE" | "LEAD",
  recordId: string,
): Promise<{ ok: boolean; taskId?: string; error?: string; already?: boolean }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't create tasks." };

  let title = "";
  let detail = "";
  let customerId: string | null = null;
  let targetType = "";

  if (kind === "INVOICE") {
    const [inv] = (await sql`
      select i.id, i.number, i.amount, i.status, c.id as customer_id, c.name as customer
      from invoices i join customers c on c.id = i.customer_id
      where i.id = ${recordId} and i.organization_id = ${session.organizationId}`) as unknown as [{
        id: string; number: string; amount: unknown; status: string; customer_id: string; customer: string;
      } | undefined];
    if (!inv || !["SENT", "OVERDUE"].includes(inv.status)) {
      return { ok: false, error: "That invoice is no longer open." };
    }
    customerId = inv.customer_id;
    targetType = "Invoice";
    title = `Collect invoice ${inv.number} — ${inv.customer}`.slice(0, 200);
    detail = `${money(inv.amount)} ${inv.status === "OVERDUE" ? "overdue" : "awaiting payment"}. Open the aging view or send the approved reminder.`;
  } else if (kind === "LEAD") {
    const [lead] = (await sql`
      select l.id, l.name, l.interest, l.est_value, l.customer_id, l.status
      from leads l
      where l.id = ${recordId} and l.organization_id = ${session.organizationId}`) as unknown as [{
        id: string; name: string; interest: string | null; est_value: unknown;
        customer_id: string | null; status: string;
      } | undefined];
    if (!lead || !["NEW", "CONTACTED"].includes(lead.status)) {
      return { ok: false, error: "That lead is no longer open." };
    }
    customerId = lead.customer_id;
    targetType = "Lead";
    title = `Follow up ${lead.name}${lead.interest ? ` — ${lead.interest}` : ""}`.slice(0, 200);
    detail = `Lead worth ${money(lead.est_value)} has gone quiet. Call or text today and log the contact.`;
  } else {
    return { ok: false, error: "Unknown task type." };
  }

  const [existing] = await sql`
    select id from tasks
    where organization_id = ${session.organizationId} and origin = 'FIELD_OPS'
      and title = ${title} and customer_id is not distinct from ${customerId}
      and status in ('OPEN', 'IN_PROGRESS')
    limit 1`;
  if (existing) return { ok: true, taskId: String(existing.id), already: true };

  const [task] = await sql`
    insert into tasks (organization_id, title, detail, status, priority, due_at, customer_id, origin)
    values (${session.organizationId}, ${title}, ${detail}, 'OPEN', 'HIGH', now() + interval '1 day',
      ${customerId}, 'FIELD_OPS')
    returning id`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "FIELD_OPS_TASK_CREATED",
    targetType,
    targetId: recordId,
    detail: title,
    metadata: { taskId: task.id, kind },
  });
  revalidatePath("/field-ops");
  revalidatePath("/execute");
  revalidatePath("/dashboard");
  return { ok: true, taskId: String(task.id) };
}

/** Log a review request against the completed job; the sender stays human. */
export async function requestFieldOpsReview(
  orderId: string,
): Promise<{ ok: boolean; channel?: string; error?: string; already?: boolean }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't request reviews." };

  const [order] = (await sql`
    select s.id, s.title, s.completed_at, c.id as customer_id, c.name, c.email, c.phone
    from service_orders s join customers c on c.id = s.customer_id
    where s.id = ${orderId} and s.organization_id = ${session.organizationId}
      and s.completed_at is not null`) as unknown as [{
        id: string; title: string; completed_at: Date; customer_id: string;
        name: string; email: string | null; phone: string | null;
      } | undefined];
  if (!order) return { ok: false, error: "Completed job not found." };

  const [existing] = await sql`
    select id from reviews
    where organization_id = ${session.organizationId} and customer_id = ${order.customer_id}
      and requested_at >= ${order.completed_at}
      and status in ('REQUESTED', 'RECEIVED')
    limit 1`;
  if (existing) return { ok: true, already: true };

  const channel = order.email ? "EMAIL" : order.phone ? "SMS" : "GOOGLE";
  await sql`
    insert into reviews (organization_id, customer_id, channel, status, requested_at)
    values (${session.organizationId}, ${order.customer_id}, ${channel}, 'REQUESTED', now())`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "REVIEW_REQUESTED",
    targetType: "Customer",
    targetId: order.customer_id,
    detail: `Review request logged after "${order.title}" via ${channel}`,
    metadata: { orderId: order.id, channel },
  });
  revalidatePath("/field-ops");
  revalidatePath("/expand/reviews");
  return { ok: true, channel };
}

/** Renew an existing agreement, or create one for a no-plan customer. */
export async function renewFieldOpsPlan(
  planId: string,
): Promise<{ ok: boolean; created?: boolean; endsAt?: string; planName?: string; error?: string }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't renew plans." };

  if (planId.startsWith("gap-")) {
    const customerId = planId.slice(4);
    const [customer] = await sql`
      select id, name from customers
      where id = ${customerId} and organization_id = ${session.organizationId}`;
    if (!customer) return { ok: false, error: "Customer not found." };

    const [catalog] = await sql`
      select name, annual_value from service_plans
      where organization_id = ${session.organizationId} and active = true
      order by featured desc, annual_value asc
      limit 1`;
    const planName = String(catalog?.name ?? "Service plan");
    const annual = Number(catalog?.annual_value ?? 0);
    let created;
    try {
      [created] = await sql`
        insert into maintenance_agreements
          (organization_id, customer_id, plan_name, annual_value, starts_at, ends_at, status, notes)
        values (${session.organizationId}, ${customerId}, ${planName}, ${annual},
          now(), now() + interval '1 year', 'ACTIVE',
          'Created from Field Ops plan gap — confirm the annual price at the next renewal.')
        returning id, ends_at`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        return { ok: false, error: "This customer already has an active plan." };
      }
      throw e;
    }
    await logAudit({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "PLAN_CREATED_FROM_FIELD_OPS",
      targetType: "MaintenanceAgreement",
      targetId: String(created.id),
      detail: `${planName} created for ${customer.name}`,
      metadata: { customerId, annualValue: annual },
    });
    revalidatePath("/field-ops");
    revalidatePath("/pipeline/unscheduled");
    revalidatePath("/enhance");
    return {
      ok: true,
      created: true,
      endsAt: new Date(created.ends_at).toISOString(),
      planName,
    };
  }

  const [agreement] = (await sql`
    select id, customer_id, plan_name, annual_value, ends_at, status
    from maintenance_agreements
    where id = ${planId} and organization_id = ${session.organizationId}`) as unknown as [{
      id: string; customer_id: string; plan_name: string; annual_value: unknown;
      ends_at: Date | null; status: string;
    } | undefined];
  if (!agreement) return { ok: false, error: "Plan not found." };

  let updated;
  try {
    [updated] = await sql`
      update maintenance_agreements
      set status = 'ACTIVE',
          ends_at = greatest(coalesce(ends_at, now()), now()) + interval '1 year'
      where id = ${agreement.id} and organization_id = ${session.organizationId}
      returning id, ends_at`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return { ok: false, error: "This customer already has another active plan." };
    }
    throw e;
  }
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "PLAN_RENEWED",
    targetType: "MaintenanceAgreement",
    targetId: agreement.id,
    detail: `${agreement.plan_name} renewed through ${new Date(updated.ends_at).toISOString().slice(0, 10)}`,
    metadata: { customerId: agreement.customer_id, previousEndsAt: agreement.ends_at, annualValue: Number(agreement.annual_value ?? 0) },
  });
  revalidatePath("/field-ops");
  revalidatePath("/pipeline/unscheduled");
  revalidatePath("/enhance");
  return {
    ok: true,
    created: false,
    endsAt: new Date(updated.ends_at).toISOString(),
    planName: agreement.plan_name,
  };
}

/** Booking rules are per-org and idempotent; absent rows fall back to defaults. */
export async function setFieldOpsRule(
  key: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!WRITERS.has(session.role)) return { ok: false, error: "Members can't change booking rules." };
  if (!RULE_KEYS.has(key)) return { ok: false, error: "Unknown booking rule." };

  await sql`
    insert into field_ops_rules (organization_id, rule_key, enabled)
    values (${session.organizationId}, ${key}, ${enabled})
    on conflict (organization_id, rule_key) do update set
      enabled = excluded.enabled, updated_at = now()`;

  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "FIELD_OPS_RULE_UPDATED",
    detail: `${key} ${enabled ? "enabled" : "disabled"}`,
  });
  revalidatePath("/field-ops");
  return { ok: true };
}
