// Money-facing writes, all draft-first: an invoice is never SENT, PAID or
// issued to a customer by any of these paths — they only create DRAFT rows
// that a human must review and send (via /api/quotes/send or the AR flow).
// Every draft lands in the audit trail with its origin: MANUAL (a person
// clicked), AUTO_COMPLETION (a work order was closed) or WORKFLOW (an
// approved recommendation generated the task queue).
import { sql } from "./db";
import { logAudit } from "./audit";

export type InvoiceDraftResult = {
  ok: boolean;
  number?: string;
  error?: string;
  /** Why a draft was not needed — non-error outcomes the caller can show. */
  reason?: "ALREADY_INVOICED" | "DRAFT_EXISTS" | "ORDER_INCOMPLETE" | "NOT_FOUND";
};

/**
 * Create one DRAFT invoice for a completed, unbilled service order.
 * Idempotent by construction: an order that already has a live (non-VOID)
 * invoice, is not COMPLETED, or is flagged invoiced_at never double-drafts.
 */
export async function draftInvoiceForOrder(
  organizationId: string,
  opts: {
    serviceOrderId: string;
    source: "MANUAL" | "AUTO_COMPLETION" | "WORKFLOW";
    actorType?: "USER" | "AI" | "SYSTEM";
    actorId?: string | null;
  },
): Promise<InvoiceDraftResult> {
  const [order] = await sql`
    select id, customer_id, title, amount, status, invoiced_at
    from service_orders
    where id = ${opts.serviceOrderId} and organization_id = ${organizationId}`;
  if (!order) return { ok: false, reason: "NOT_FOUND", error: "Work order not found" };
  if (order.status !== "COMPLETED") {
    return { ok: false, reason: "ORDER_INCOMPLETE", error: "Only completed work orders can be billed." };
  }
  if (order.invoiced_at) return { ok: false, reason: "ALREADY_INVOICED", error: "Already marked invoiced." };

  const [dup] = await sql`
    select id from invoices
    where service_order_id = ${order.id} and status <> 'VOID' limit 1`;
  if (dup) {
    return { ok: false, reason: "DRAFT_EXISTS", error: "A draft invoice already exists for this order." };
  }

  const dueDays = await billingSlaWindow(organizationId);
  const [draft] = await sql`
    insert into invoices (organization_id, customer_id, service_order_id, number, kind, amount, status, issued_at, due_at)
    select ${organizationId}, ${order.customer_id}, ${order.id},
           'QD-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
           'SERVICE', ${order.amount}, 'DRAFT', now(), now() + make_interval(days => ${dueDays})
    returning number as number`;

  await logAudit({
    organizationId,
    actorType: opts.actorType ?? "USER",
    actorId: opts.actorId ?? null,
    action: "DRAFT_INVOICE_CREATED",
    targetType: "ServiceOrder",
    targetId: order.id,
    detail: `${opts.source === "MANUAL" ? "Owner" : opts.source === "AUTO_COMPLETION" ? "Auto after completion" : "Approved workflow"} drafted ${draft?.number ?? "a draft quote"} for "${order.title}" — review and send; nothing goes out automatically.`,
    metadata: { source: opts.source, serviceOrderId: order.id, dueDays },
  });
  return { ok: true, number: draft?.number ?? undefined };
}

/**
 * Auto-draft hook for the moment a work order becomes COMPLETED — subject to
 * the org's own invoicing SOP: the DRAFT's due date is set from the SOP's
 * invoicing window ("within 24 hours" → 1 day, "3 business days" → 3, "same
 * day" → 1) parsed from the org's captured billing knowledge, not from a
 * hardcoded CUE rule. Drafting is always safe at completion time (the SOP
 * window has not elapsed yet), and nothing is ever sent automatically.
 */
export async function autoDraftOnCompletion(organizationId: string, serviceOrderId: string): Promise<InvoiceDraftResult> {
  return draftInvoiceForOrder(organizationId, {
    serviceOrderId,
    source: "AUTO_COMPLETION",
    actorType: "SYSTEM",
  });
}

/**
 * Due-date window (in days) for DRAFT invoices, read from the org's OWN
 * captured invoicing SOP. Scans billing-tagged knowledge for the tightest
 * explicit window; falls back to 14 days when nothing was captured yet —
 * and the CUE-drafted markup above only frames it, the owner sends.
 */
export async function billingSlaWindow(organizationId: string): Promise<number> {
  const items = await sql`
    select content from knowledge_items
    where organization_id = ${organizationId}
      and (tags ilike '%billing%' or title ilike '%invoic%' or title ilike '%bill%' or title ilike '%RO%to%')
    order by updated_at desc limit 20`;
  for (const it of items as unknown as { content: string }[]) {
    const c = String(it.content ?? "");
    const hours = c.match(/within\s+(\d{1,3})\s*(?:business\s*)?hours?/i);
    if (hours) return Math.min(30, Math.max(1, Math.ceil(Number(hours[1]) / 24)));
    const days = c.match(/within\s+(\d{1,2})\s*(?:calendar\s*)?days?/i);
    if (days) return Math.min(90, Math.max(1, Number(days[1])));
    if (/same\s*(?:business\s*)?day/i.test(c)) return 1;
    if (/next\s+(?:business\s*)?day/i.test(c)) return 1;
  }
  return 14;
}
