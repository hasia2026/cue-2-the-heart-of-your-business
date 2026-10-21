// Localized payment reminders for unpaid AR invoices — the ERP-style
// "accounts receivable automation" for CUE, built on the same locale
// machinery as quotes (customers.preferred_locale → 4 languages, anything
// else falls back to en). Draft-first: the UI shows exactly what would go
// out, and only a confirm call sends anything. The same send path powers
// the manual confirm (POST /api/invoices/remind) and the owner-approved
// cadence (GET /api/reminders cron), so automation can never send anything
// the manual flow wasn't already able to send.
import { sql } from "./db";
import { mailerConnected, sendMail } from "./mailer";
import { whatsappConnected, sendWhatsAppText } from "./whatsapp";
import { logAudit } from "./audit";


export type ArReminderDraft = {
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  locale: string;
  invoiceNumbers: string[];
  total: number;
  oldestDueDaysAgo: number | null;
  lines: { number: string; amount: number; due: string | null; overdue: boolean }[];
  text: string;
};

const L: Record<string, Record<string, string>> = {
  en: {
    header: "Payment reminder from",
    invoice: "Invoice",
    total: "Total due",
    overdueFor: "Overdue for {d} days",
    ask: "Reply to this message or call us to settle the balance — we can take payment same day.",
    thanks: "Thank you for keeping us in the loop.",
  },
  es: {
    header: "Recordatorio de pago de",
    invoice: "Factura",
    total: "Total adeudado",
    overdueFor: "Vencida hace {d} días",
    ask: "Responda a este mensaje o llámenos para liquidar el saldo — podemos recibir el pago el mismo día.",
    thanks: "Gracias por mantenernos al tanto.",
  },
  ar: {
    header: "تذكير بالدفع من",
    invoice: "الفاتورة",
    total: "الإجمالي المستحق",
    overdueFor: "متأخرة منذ {d} يومًا",
    ask: "يمكنك الرد على هذه الرسالة أو الاتصال بنا لتسديد الرصيد — نستقبل الدفع في نفس اليوم.",
    thanks: "شكرًا لإبقائنا على اطلاع.",
  },
  vi: {
    header: "Nhắc thanh toán từ",
    invoice: "Hóa đơn",
    total: "Tổng phải trả",
    overdueFor: "Quá hạn {d} ngày",
    ask: "Vui lòng trả lời tin nhắn này hoặc gọi cho chúng tôi để thanh toán số dư — chúng tôi nhận thanh toán trong ngày.",
    thanks: "Cảm ơn quý khách đã hợp tác.",
  },
};

export function reminderLocale(locale: string | null | undefined): string {
  return locale && locale in L ? locale : "en";
}

export type ArSendLine = { customer: string; channel: string; sent: boolean; error?: string };

export type ArSendResult = {
  sent: number;
  attempted: number;
  /** Customers with open unpaid invoices beyond the per-run cap — queued for
   *  the next cadence run rather than silently dropped. Shown to the owner. */
  leftover: number;
  results: ArSendLine[];
  drafts: ArReminderDraft[];
};

/**
 * Build drafts and deliver them (WhatsApp where a phone exists and it's
 * connected, email otherwise; channels are reported, never faked). Shared by
 * the manual confirm route and the automated cadence cron — identical
 * content, identical records: communications rows + one audit entry.
 */
export async function sendArReminders(
  orgId: string,
  opts: { limit?: number; auditAction?: string; auditDetail?: string } = {},
): Promise<ArSendResult> {
  const all = await buildArReminders(orgId);
  const drafts = all.slice(0, opts.limit ?? 10);
  const leftover = Math.max(0, all.length - drafts.length);
  const mailOn = mailerConnected();
  const waOn = whatsappConnected();
  const results: ArSendLine[] = [];

  for (const d of drafts) {
    if (d.phone && waOn) {
      const r = await sendWhatsAppText(d.phone, d.text);
      results.push({ customer: d.customerName, channel: "WHATSAPP", ...r });
    } else if (d.email && mailOn) {
      const r = await sendMail({ to: d.email, subject: "Payment reminder", text: d.text });
      results.push({ customer: d.customerName, channel: "EMAIL", ...r });
    } else {
      results.push({
        customer: d.customerName,
        channel: d.phone ? "WHATSAPP" : d.email ? "EMAIL" : "NONE",
        sent: false,
        error: !d.phone && !d.email ? "Customer has no phone or email on file" : "Channel not connected",
      });
    }
  }

  // Record outbound contacts + the audit trail entry, then return honestly.
  const sentResults = results.filter((r) => r.sent);
  for (const r of sentResults) {
    const draft = drafts.find((d) => d.customerName === r.customer)!;
    await sql`
      insert into communications (organization_id, customer_id, channel, direction, summary)
      values (${orgId}, ${draft.customerId},
              ${r.channel === "EMAIL" ? "EMAIL" : "SMS"}, 'OUTBOUND',
              ${"Payment reminder for " + draft.invoiceNumbers.join(", ")})`;
  }
  if (drafts.length) {
    await logAudit({
      organizationId: orgId,
      actorType: "SYSTEM",
      action: opts.auditAction ?? "PAYMENT_REMINDER_SENT",
      detail: [
        opts.auditDetail,
        `${sentResults.length}/${drafts.length} reminder(s) delivered in ${Array.from(new Set(sentResults.map((r) => r.channel))).join("+") || "no channel"}`,
        leftover > 0 ? `${leftover} customer(s) beyond the send cap queued for the next run` : null,
      ].filter(Boolean).join(" — "),
      metadata: { sent: sentResults.length, attempted: drafts.length, leftover },
    });
  }

  return { sent: sentResults.length, attempted: drafts.length, leftover, results, drafts };
}

/** Every open billed invoice grouped per customer. "Open" = billed but not
 *  paid/void: SENT (due passed or due soon — the schema keeps SENT rather
 *  than flipping to OVERDUE automatically) and OVERDUE (explicitly flagged). */
export async function buildArReminders(orgId: string): Promise<ArReminderDraft[]> {
  const rows = await sql`
    select c.id as customer_id, c.name, c.email, c.phone, c.preferred_locale,
           i.number, i.amount, i.due_at, i.status
    from invoices i
    join customers c on c.id = i.customer_id
    where i.organization_id = ${orgId} and i.status in ('SENT','OVERDUE')
    order by i.due_at asc nulls last`;
  // Owner-editable message template (Settings). null = the built-in
  // localized draft below; a saved template overrides the free-text
  // wrapper while the localized invoice lines / totals still fill it.
  const [bp] = await sql`select reminder_template from business_profiles where organization_id = ${orgId}`;
  const template = typeof bp?.reminder_template === "string" ? bp.reminder_template.slice(0, 4000) : null;

  type Acc = Omit<ArReminderDraft, "text">;
  const byCustomer = new Map<string, Acc>();
  for (const r of rows) {
    let acc = byCustomer.get(r.customer_id);
    if (!acc) {
      acc = {
        customerId: r.customer_id,
        customerName: r.name,
        email: r.email ?? null,
        phone: r.phone ?? null,
        locale: reminderLocale(r.preferred_locale),
        invoiceNumbers: [],
        lines: [],
        total: 0,
        oldestDueDaysAgo: null,
      };
      byCustomer.set(r.customer_id, acc);
    }
    const due = r.due_at ? new Date(r.due_at) : null;
    const daysOver = due ? Math.max(0, Math.floor((Date.now() - due.getTime()) / 864e5)) : null;
    acc.invoiceNumbers.push(r.number);
    acc.lines.push({
      number: r.number,
      amount: Number(r.amount),
      due: due ? due.toLocaleDateString("en-US") : null,
      overdue: r.status === "OVERDUE" || (daysOver ?? 0) > 0,
    });
    acc.total += Number(r.amount);
    if (daysOver != null && (acc.oldestDueDaysAgo == null || daysOver > acc.oldestDueDaysAgo)) {
      acc.oldestDueDaysAgo = daysOver;
    }
  }

  const drafts: ArReminderDraft[] = [];
  for (const acc of byCustomer.values()) {
    const t = L[acc.locale];
    const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
    const over = acc.oldestDueDaysAgo && acc.oldestDueDaysAgo > 0 ? t.overdueFor.replace("{d}", String(acc.oldestDueDaysAgo)) : "";
    const invoiceBlock = acc.lines
      .map((l) => `• ${t.invoice} ${l.number}${l.due ? ` (${l.due})` : ""} — ${money(l.amount)}`)
      .join("\n");

    let text: string;
    if (template) {
      // Placeholders get localized fills; anything the owner's copy omits is
      // appended as a safety net — a payment reminder without the invoice
      // list or the total would not be a payment reminder.
      text = template
        .replaceAll("{name}", acc.customerName)
        .replaceAll("{days}", String(acc.oldestDueDaysAgo ?? 0))
        .replaceAll("{overdue}", over)
        .replaceAll("{invoices}", invoiceBlock)
        .replaceAll("{total}", money(acc.total));
      if (!template.includes("{total}")) text += `\n\n${t.total}: ${money(acc.total)}`;
      if (!template.includes("{invoices}")) text = `${invoiceBlock}\n\n` + text;
    } else {
      text = [
        `${t.header} — ${acc.customerName}`,
        "",
        invoiceBlock,
        "",
        `${t.total}: ${money(acc.total)}${over ? `\n${over}` : ""}`,
        "",
        t.ask,
        t.thanks,
      ].join("\n");
    }

    drafts.push({ ...acc, text });
  }
  return drafts;
}
