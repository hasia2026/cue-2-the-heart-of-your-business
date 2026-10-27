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
import { getWorkspaceProfile, validAccent } from "./workspace-profile";

// Workspace Studio brand fields resolved for an org — null-safe at every level.
async function orgBrand(orgId: string): Promise<{ name: string | null; accent: string | null; logo: string | null; contactPhone: string | null; contactEmail: string | null }> {
  const [org] = await sql`select name from organizations where id = ${orgId}`;
  const p = await getWorkspaceProfile(orgId);
  return {
    name: p.brandNameOverride || ((org?.name as string) || null),
    accent: validAccent(p.brandAccent),
    logo: p.brandLogoUrl,
    contactPhone: p.brandContactPhone,
    contactEmail: p.brandContactEmail,
  };
}

export type QuoteItem = { description: string; amount: number };
/** One choice in a multi-option (Good–Better–Best) quote. key: "A"|"B"|"C"|"D". */
export type QuoteOption = { key: string; name: string; amount: number; note?: string | null };
export type QuotePayload = {
  customerName: string;
  customerEmail: string | null;
  title: string;
  items: QuoteItem[];
  options?: QuoteOption[]; // present → render as an options quote (items become a plain "single option")
  decisionUrl?: string | null; // public /q/<token> once a send is recorded
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
    choose: "Choose an option",
    optOn: "Option",
    acceptBtn: "Accept", // x-crm-accept
    declineBtn: "Decline",
    declineAllBtn: "None of these are right",
    noLink: "(Decision buttons arrive broken in the text version — open the email as HTML, or reply.)",
    closing: "Thank you for the opportunity to earn your business.",
    planCta: "Sign up for a maintenance plan →",
  },
  es: {
    heading: "Su cotización de",
    lineItems: "Partidas",
    total: "Total",
    validUntil: "Válida hasta",
    notes: "Notas",
    accept: "Responda a este correo para aceptar o hacer cualquier pregunta — contestamos el mismo día.",
    choose: "Elija una opción",
    optOn: "Opción",
    acceptBtn: "Aceptar",
    declineBtn: "No me interesa",
    declineAllBtn: "Ninguna opción me sirve",
    noLink: "(Los botones no aparecen en esta versión de texto — abra el email como HTML o responda.)",
    closing: "Gracias por la oportunidad de servirle.",
    planCta: "Regístrese en un plan de mantenimiento →",
  },
  ar: {
    heading: "عرض السعر من",
    lineItems: "بنود العمل",
    total: "الإجمالي",
    validUntil: "صالح حتى",
    notes: "ملاحظات",
    accept: "قم بالرد على هذا البريد للقبول أو لأي سؤال — نجيب في نفس اليوم.",
    choose: "اختر خيارًا",
    optOn: "الخيار",
    acceptBtn: "قبول",
    declineBtn: "رفض",
    declineAllBtn: "لا يناسبني أي خيار",
    noLink: "(الأزرار لا تظهر في نسخة النص — افتح البريد بصيغة HTML أو رُد.)",
    closing: "شكرًا لمنحنا فرصة خدمتك.",
    planCta: "سجّل في خطة صيانة →",
  },
  vi: {
    heading: "Báo giá từ",
    lineItems: "Chi tiết các hạng mục",
    total: "Tổng cộng",
    validUntil: "Có hiệu lực đến",
    notes: "Ghi chú",
    accept: "Vui lòng trả lời email này để chấp nhận hoặc hỏi bất cứ điều gì — chúng tôi trả lời trong ngày.",
    choose: "Chọn một phương án",
    optOn: "Phương án",
    acceptBtn: "Chấp nhận",
    declineBtn: "Từ chối",
    declineAllBtn: "Không phương án nào phù hợp",
    noLink: "(Nút bấm không xuất hiện trong bản văn bản thuần — hãy mở email dạng HTML hoặc trả lời.)",
    closing: "Cảm ơn quý khách đã cho chúng tôi cơ hội phục vụ.",
    planCta: "Đăng ký gói bảo trì →",
  },
};

export function quoteLocale(locale: string | null | undefined): string {
  return locale && locale in L ? locale : "en";
}

export function renderQuoteText(q: QuotePayload, locale: string | null | undefined, plansUrl?: string | null): string {
  const t = L[quoteLocale(locale)];
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const options = q.options ?? [];
  const hasOptions = options.length > 0;
  const optionBlock = hasOptions
    ? [
        "",
        q.decisionUrl ? `${t.choose} — open this link in your browser:` : t.choose + " (reply with your letter — A, B, C…)" + (q.decisionUrl ? "" : ` ${t.noLink}`),
        q.decisionUrl ? q.decisionUrl : "",
        ...options.map((o) =>
          `${t.optOn} ${o.key} — ${o.name} — ${money(o.amount)}${o.note ? ` (${o.note})` : ""}`,
        ),
      ]
    : null;
  const total = q.items.reduce((s, i) => s + i.amount, 0);
  return [
    `${t.heading} — ${q.title}`,
    "",
    // When options are present the “items” block is the base option; the
    // choice itself is listed after it.
    q.items.map((i) => `• ${i.description} — ${money(i.amount)}`).join("\n"),    ...(optionBlock ?? []),
    hasOptions ? "" : `${t.total}: ${money(total)}`,
    q.validUntil ? `${t.validUntil}: ${q.validUntil}` : "",
    q.notes ? `${t.notes}: ${q.notes}` : "",
    "",
    t.accept,
    // Sign-up CTA (spec §3): plain URL line so the text fallback carries the
    // plan offer too.
    ...(plansUrl ? [t.planCta ?? "", plansUrl] : []),
    t.closing,
  ].filter(Boolean).join("\n");
}

export function renderQuoteHtml(
  q: QuotePayload,
  locale: string | null | undefined,
  brand?: { name: string | null; accent: string | null; logo: string | null; contactPhone: string | null; contactEmail: string | null },
  plansUrl?: string | null,
): string {
  const t = L[quoteLocale(locale)];
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const total = q.items.reduce((s, i) => s + i.amount, 0);
  const optionCards = (q.options ?? []).length > 0
    ? `<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b93b8;margin:4px 0 8px 4px;">${esc(t.choose)}</div>` +
      (q.options ?? []).map((o) => {
        const acceptHref = q.decisionUrl ? `${q.decisionUrl}?o=${o.key}` : null;
        const declineHref = q.decisionUrl ? `${q.decisionUrl}?d=1` : null;
        return `<div style="background:#141428;border-radius:12px;padding:16px 18px;margin:0 0 10px;border-left:4px solid ${accent};">` +
          `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">` +
          `<div style="font-size:15px;font-weight:700;color:#ffffff;">${esc(t.optOn)} ${esc(o.key)} · ${esc(o.name)}</div>` +
          `<div style="font-size:16px;font-weight:700;color:${accent};white-space:nowrap;">${money(o.amount)}</div></div>` +
          (o.note ? `<div style="font-size:12px;color:#8b93b8;margin-top:4px;">${esc(o.note)}</div>` : "") +
          (acceptHref 
            ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">` +
              `<a href="${esc(acceptHref)}" style="display:inline-block;background:${accent};color:#0b0b18;font-weight:700;font-size:13px;padding:8px 16px;border-radius:999px;text-decoration:none;">${esc(t.acceptBtn)} ✓</a>` +
              `<a href="${esc(declineHref ?? "")}" style="display:inline-block;background:transparent;color:#8b93b8;font-weight:600;font-size:13px;padding:8px 16px;border-radius:999px;text-decoration:none;border:1px solid rgba(255,255,255,.15);">${esc(t.declineBtn)}</a>` +
              `</div>`
            : `<div style="margin-top:8px;font-size:12px;color:#6b7396;">${esc(t.noLink)}</div>`) +
          `</div>`;
      }).join("") +
      (q.decisionUrl
        ? `<div style="text-align:center;margin:2px 0 14px;"><a href="${esc(q.decisionUrl)}?d=1" style="color:#8b93b8;font-size:12px;text-decoration:underline;">${esc(t.declineAllBtn)}</a></div>`
        : "")
    : "";
  const dir = quoteLocale(locale) === "ar" ? ` dir="rtl"` : "";
  // Workspace Studio branding: accent falls back to the stock violet.
  const accent = brand?.accent ?? "#7c6cff";
  const logo = brand?.logo
    ? `<img src="${esc(brand.logo)}" alt="" style="max-height:44px;max-width:180px;object-fit:contain;margin-bottom:10px;display:block;" />`
    : "";
  const brandLine = brand?.name ? esc(brand.name) : "CUE";
  const contactBits = [brand?.contactPhone, brand?.contactEmail].filter((x): x is string => Boolean(x)).map(esc).join(" · ");
  const contactFooter = contactBits
    ? `<div style="font-size:11px;color:#6b7396;margin-top:10px;">${contactBits}</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0b18;font-family:-apple-system,Segoe UI,Roboto,sans-serif;"><div${dir} style="max-width:600px;margin:0 auto;padding:24px 16px;">
  ${logo}
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:6px;">${brandLine} · ${esc(t.heading)}</div>
  <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">${esc(q.title)}</div>
  <div style="font-size:13px;color:#8b93b8;margin-bottom:18px;">${esc(q.customerName)}</div>
  <div style="background:#141428;border-radius:12px;padding:18px 20px;margin:0 0 14px;border-left:4px solid #7c6cff;">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b93b8;margin-bottom:8px;">${esc(t.lineItems)}</div>
    ${q.items.map((i) => `<div style="display:flex;justify-content:space-between;font-size:14px;color:#e8eaf6;padding:3px 0;"><span>${esc(i.description)}</span><span>${money(i.amount)}</span></div>`).join("")}
    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#ffffff;border-top:1px solid rgba(255,255,255,.12);margin-top:10px;padding-top:8px;"><span>${esc(t.total)}</span><span>${money(total)}</span></div>
    ${q.validUntil ? `<div style="font-size:12px;color:#8b93b8;margin-top:8px;">${esc(t.validUntil)}: ${esc(q.validUntil)}</div>` : ""}
    ${q.notes ? `<div style="font-size:12px;color:#8b93b8;margin-top:4px;">${esc(t.notes)}: ${esc(q.notes)}</div>` : ""}
  </div>
  ${optionCards}
  <div style="font-size:13px;color:#c9cdea;line-height:1.5;">${esc(t.accept)}<br/>${esc(t.closing)}</div>
  ${plansUrl ? `<div style="text-align:center;margin-top:16px;"><a href="${esc(plansUrl)}" style="display:inline-block;background:${accent};color:#0b0b18;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;text-decoration:none;">${esc(t.planCta ?? "Sign up for a maintenance plan →")}</a></div>` : ""}
  ${contactFooter}
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
  /** Resolved by the caller via lib/plan-links.signupUrl — builders stay pure. */
  plansUrl?: string | null;
}): Promise<{ connected: boolean; sent: boolean; error?: string; langUsed: string }> {
  const { quote: q, locale } = opts;
  const subject = `${L[quoteLocale(locale)].heading} — ${q.title}`;
  const brand = await orgBrand(opts.orgId);
  const mail = mailerConnected()
    ? await sendMail({
        to: q.customerEmail!,
        subject,
        text: renderQuoteText(q, locale, opts.plansUrl),
        html: renderQuoteHtml(q, locale, brand, opts.plansUrl),
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
