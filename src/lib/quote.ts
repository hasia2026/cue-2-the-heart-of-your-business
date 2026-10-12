// Localized quote delivery — resolves a household's language, renders the
// quote as HTML + plain text in that language, and sends via the existing
// Resend pipeline. Language precedence:
//   1. explicit override handed by the caller (owner chose it this send)
//   2. customers.preferred_locale (set at capture or profile time)
//   3. org default (env-free: "en"); everything hard-falls-back to en anyway
// Only the four shipped locales are accepted; anything else falls back en.
import { sql } from "./db";
import { mailerConnected, sendMail } from "./mailer";
import { logAudit } from "./audit";

export type QuoteItem = { description: string; amount: number };
export type QuotePayload = {
  customerName: string;
  customerEmail: string | null;
  title: string;
  items: QuoteItem[];
  notes?: string | null;
  validUntil?: string | null; // already-formatted date string
};

const L: Record<string, Record<string, string>> = {
  en: {
    heading: "Your quote from",
    lineItems: "Line items",
    total: "Total",
    validUntil: "Valid until",
    notes: "Notes",
    accept: "Reply to this email to accept or ask any question — we answer same day.",
    closing: "Thank you for the opportunity to earn your business.",
  },
  es: {
    heading: "Su cotización de",
    lineItems: "Partidas",
    total: "Total",
    validUntil: "Válida hasta",
    notes: "Notas",
    accept: "Responda a este correo para aceptar o hacer cualquier pregunta — contestamos el mismo día.",
    closing: "Gracias por la oportunidad de servirle.",
  },
  ar: {
    heading: "عرض السعر من",
    lineItems: "بنود العمل",
    total: "الإجمالي",
    validUntil: "صالح حتى",
    notes: "ملاحظات",
    accept: "قم بالرد على هذا البريد للقبول أو لأي سؤال — نجيب في نفس اليوم.",
    closing: "شكرًا لمنحنا فرصة خدمتك.",
  },
  vi: {
    heading: "Báo giá từ",
    lineItems: "Chi tiết các hạng mục",
    total: "Tổng cộng",
    validUntil: "Có hiệu lực đến",
    notes: "Ghi chú",
    accept: "Vui lòng trả lời email này để chấp nhận hoặc hỏi bất cứ điều gì — chúng tôi trả lời trong ngày.",
    closing: "Cảm ơn quý khách đã cho chúng tôi cơ hội phục vụ.",
  },
};

export function quoteLocale(locale: string | null | undefined): string {
  return locale && locale in L ? locale : "en";
}

export function renderQuoteText(q: QuotePayload, locale: string | null | undefined): string {
  const t = L[quoteLocale(locale)];
  const total = q.items.reduce((s, i) => s + i.amount, 0);
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  return [
    `${t.heading} — ${q.title}`,
    "",
    q.items.map((i) => `• ${i.description} — ${money(i.amount)}`).join("\n"),
    "",
    `${t.total}: ${money(total)}`,
    q.validUntil ? `${t.validUntil}: ${q.validUntil}` : "",
    q.notes ? `${t.notes}: ${q.notes}` : "",
    "",
    t.accept,
    t.closing,
  ].filter(Boolean).join("\n");
}

export function renderQuoteHtml(q: QuotePayload, locale: string | null | undefined): string {
  const t = L[quoteLocale(locale)];
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const total = q.items.reduce((s, i) => s + i.amount, 0);
  const dir = quoteLocale(locale) === "ar" ? ` dir="rtl"` : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0b18;font-family:-apple-system,Segoe UI,Roboto,sans-serif;"><div${dir} style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7c6cff;margin-bottom:6px;">CUE · ${esc(t.heading)}</div>
  <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">${esc(q.title)}</div>
  <div style="font-size:13px;color:#8b93b8;margin-bottom:18px;">${esc(q.customerName)}</div>
  <div style="background:#141428;border-radius:12px;padding:18px 20px;margin:0 0 14px;border-left:4px solid #7c6cff;">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b93b8;margin-bottom:8px;">${esc(t.lineItems)}</div>
    ${q.items.map((i) => `<div style="display:flex;justify-content:space-between;font-size:14px;color:#e8eaf6;padding:3px 0;"><span>${esc(i.description)}</span><span>${money(i.amount)}</span></div>`).join("")}
    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#ffffff;border-top:1px solid rgba(255,255,255,.12);margin-top:10px;padding-top:8px;"><span>${esc(t.total)}</span><span>${money(total)}</span></div>
    ${q.validUntil ? `<div style="font-size:12px;color:#8b93b8;margin-top:8px;">${esc(t.validUntil)}: ${esc(q.validUntil)}</div>` : ""}
    ${q.notes ? `<div style="font-size:12px;color:#8b93b8;margin-top:4px;">${esc(t.notes)}: ${esc(q.notes)}</div>` : ""}
  </div>
  <div style="font-size:13px;color:#c9cdea;line-height:1.5;">${esc(t.accept)}<br/>${esc(t.closing)}</div>
</div></body></html>`;
}

/** Resolves how the quote should be sent: language + honest deliverability. */
export async function resolveQuoteDelivery(
  orgId: string,
  customerId: string,
  overrideLocale?: string | null,
): Promise<{ locale: string; source: "override" | "customer" | "default"; email: string | null; name: string } | null> {
  const [c] = await sql`
    select name, preferred_locale, email from customers where id = ${customerId} and organization_id = ${orgId}`;
  if (!c) return null;
  const locale = quoteLocale(overrideLocale ?? (c.preferred_locale as string | null));
  // "override" only when the caller actually chose a language this send;
  // else the customer's stored preference; else the business default (en).
  const source: "override" | "customer" | "default" =
    overrideLocale ? "override" : c.preferred_locale ? "customer" : "default";
  return {
    locale,
    source,
    email: (c.email as string | null) ?? null,
    name: c.name as string,
  };
}

/** Sends the quote email (HTML in the resolved locale, text fallback). */
export async function sendQuoteEmail(opts: {
  orgId: string;
  quote: QuotePayload;
  locale: string;
  subjectNote?: string;
}): Promise<{ connected: boolean; sent: boolean; error?: string; langUsed: string }> {
  const { quote: q, locale } = opts;
  const subject = `${L[quoteLocale(locale)].heading} — ${q.title}`;
  const mail = mailerConnected()
    ? await sendMail({
        to: q.customerEmail!,
        subject,
        text: renderQuoteText(q, locale),
        html: renderQuoteHtml(q, locale),
      })
    : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };

  await logAudit({
    organizationId: opts.orgId,
    actorType: "SYSTEM",
    action: "QUOTE_SENT",
    targetType: "Quote",
    targetId: q.title,
    detail: `quote to ${q.customerName} in ${locale}`,
  });

  return { ...mail, langUsed: locale };
}
