"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  dismissSuggestedOrderItem,
  restoreSuggestedOrderItem,
} from "@/lib/suggested-order";
import { buildArReminders, sendArReminders } from "@/lib/reminders";
import { rateLimitResult } from "@/lib/rate-limit";

// Actions for the overdue-aging drill-down. Two kinds, both keyed by invoice:
//   • chase check-off / restore — the SAME suggested_order_dismissals rows the
//     Intake card and the digest read, so a chase closed here disappears from
//     the card and Monday's email too (and comes back only by restore).
//   • payment reminder — draft-first, exactly the cadence content: the preview
//     is the AR template the owner already approved, and only an explicit
//     send call delivers anything. Owner/Admin/Manager only, same hourly cap
//     as /api/invoices/remind (it fans out to a real customer).

type InvoiceForChase = { id: string; number: string; amount: number; kind: string };

async function invoiceForChase(orgId: string, invoiceId: string): Promise<InvoiceForChase> {
  if (!invoiceId) throw new Error("Missing invoice.");
  const [r] = (await sql`
    select id, number, amount, kind
    from invoices
    where organization_id = ${orgId} and id = ${invoiceId}
    limit 1`) as unknown as InvoiceForChase[];
  if (!r) throw new Error("That invoice isn't in this workspace.");
  return r;
}

/** Check off the collection chase for one overdue invoice. */
export async function checkOffInvoiceChase(invoiceId: string): Promise<void> {
  const session = await requireSessionAction();
  const inv = await invoiceForChase(session.organizationId, invoiceId);
  await dismissSuggestedOrderItem(session.organizationId, session.user.id, session.user.name, {
    category: "INVOICE_OVERDUE",
    record: inv.number,
    detail: `$${Number(inv.amount ?? 0).toFixed(2)} ${inv.kind ?? ""}`.trim(),
  });
  revalidatePath("/pipeline/aging");
  revalidatePath("/intake/import");
  revalidatePath("/pipeline");
}

/** Bring a checked-off chase back (dismissal id, org-scoped). */
export async function restoreInvoiceChase(dismissalId: string): Promise<void> {
  const session = await requireSessionAction();
  if (!dismissalId) throw new Error("Missing chase id.");
  await restoreSuggestedOrderItem(session.organizationId, dismissalId);
  revalidatePath("/pipeline/aging");
  revalidatePath("/intake/import");
  revalidatePath("/pipeline");
}

export type ReminderPreview = {
  ok: boolean;
  message?: string;
  draft?: { customerName: string; locale: string; total: number; text: string };
};

/** Draft the reminder for ONE invoice — the cadence template, per customer
 *  language, nothing sent. */
export async function previewInvoiceReminder(invoiceId: string): Promise<ReminderPreview> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, message: "Owner, Admin or Manager access required." };
  }
  await invoiceForChase(session.organizationId, invoiceId);
  const [draft] = await buildArReminders(session.organizationId, { invoiceIds: [invoiceId] });
  if (!draft) {
    return { ok: false, message: "Nothing to remind — that invoice is no longer open." };
  }
  return {
    ok: true,
    draft: {
      customerName: draft.customerName,
      locale: draft.locale,
      total: draft.total,
      text: draft.text,
    },
  };
}

/** Send the draft the owner just saw — WhatsApp when a number is on file,
 *  email otherwise; per-org hourly cap, reported honestly. */
export async function sendInvoiceReminder(invoiceId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, message: "Owner, Admin or Manager access required." };
  }
  const rl = rateLimitResult(`reminders:${session.organizationId}`, 20, 3600_000);
  if (!rl.ok) {
    return { ok: false, message: `Reminder limit reached — try again in ${rl.retryAfterSecs}s.` };
  }
  const inv = await invoiceForChase(session.organizationId, invoiceId);
  const { attempted, results } = await sendArReminders(session.organizationId, {
    invoiceIds: [invoiceId],
    limit: 1,
    auditAction: "PAYMENT_REMINDER_SENT",
    auditDetail: `from overdue aging — invoice ${inv.number}`,
  });
  if (attempted === 0) {
    return { ok: false, message: "Nothing to remind — that invoice is no longer open." };
  }
  const [line] = results;
  if (!line?.sent) {
    return { ok: false, message: line?.error ?? "Reminder could not be delivered." };
  }
  revalidatePath("/pipeline/aging");
  return {
    ok: true,
    message: `Reminder for ${inv.number} sent to ${line.customer} via ${line.channel.toLowerCase()}.`,
  };
}
