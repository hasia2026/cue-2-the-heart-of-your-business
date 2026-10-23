"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { draftInvoiceForOrder, autoDraftOnCompletion } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

const money = (n: unknown) => Number(n ?? 0).toFixed(2);

/**
 * Mark a service order COMPLETED. CUE immediately drafts an invoice for it
 * (still draft-first: the owner reviews and sends from Pipeline), with the
 * draft's due date set from the org's own invoicing SOP.
 */
export async function markOrderCompleted(orderId: string) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") return { ok: false, error: "Owner, Admin or Manager access required" };

  const [order] = await sql`
    update service_orders
    set status = 'COMPLETED', completed_at = now()
    where id = ${orderId} and organization_id = ${session.organizationId} and status <> 'COMPLETED'
    returning id, title, amount`;
  if (!order) return { ok: false, error: "Work order not found or already completed." };

  const draft = await autoDraftOnCompletion(session.organizationId, String(order.id));
  revalidatePath("/pipeline");
  return {
    ok: true,
    title: String(order.title),
    amount: money(order.amount),
    draftNumber: draft.ok ? draft.number : undefined,
    skipped: draft.reason,
  };
}

/** Manual draft invoice for a completed, unbilled order — no AI recommendation needed. */
export async function draftOrderInvoice(orderId: string) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") return { ok: false, error: "Owner, Admin or Manager access required" };

  const result = await draftInvoiceForOrder(session.organizationId, {
    serviceOrderId: orderId,
    source: "MANUAL",
    actorType: "USER",
    actorId: session.user.id,
  });
  if (result.ok) revalidatePath("/pipeline");
  return result;
}

/**
 * Release one DRAFT invoice as SENT. This is the controlled human step the
 * draft-first doctrine always pointed to: the owner reviews the draft (and
 * may correct the amount, which is mutated to the ledger afterward), one
 * confirm flips DRAFT → SENT with issued_at, and an audit entry names who
 * released it. Nothing customer-facing is emailed here — the AR reminder
 * cadence in lib/reminders.ts handles follow-up messaging to SENT invoices.
 */
export async function releaseDraftInvoice(invoiceId: string, amount: number) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") return { ok: false, error: "Owner, Admin or Manager access required" };
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    return { ok: false, error: "Enter a valid invoice amount" };
  }
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (origin && host && !new URL(origin).host.endsWith(host)) {
    return { ok: false, error: "Cross-origin request refused" };
  }
  const [inv] = await sql`
    update invoices
    set status = 'SENT', amount = ${amount.toFixed(2)}, issued_at = now()
    where id = ${invoiceId} and organization_id = ${session.organizationId} and status = 'DRAFT'
    returning number, kind, amount`;
  if (!inv) return { ok: false, error: "Draft not found (already released or voided?)." };
  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DRAFT_INVOICE_RELEASED",
    targetType: "Invoice",
    targetId: invoiceId,
    detail: `${session.user.name} released draft ${inv.number} as SENT (${inv.kind}) for $${amount.toFixed(2)} — reviewed and confirmed; AR follow-up handled by the reminder cadence.`,
    metadata: { invoiceId, finalAmount: amount.toFixed(2) },
  });
  revalidatePath("/pipeline");
  return { ok: true, number: String(inv.number) };
}
