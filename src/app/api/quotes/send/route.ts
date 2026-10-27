import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isLocale } from "@/lib/i18n";
import {
  QuotePayload,
  renderQuoteHtml,
  renderQuoteText,
  resolveQuoteDelivery,
  sendQuoteEmail,
  quoteLocale,
} from "@/lib/quote";
import { rateLimitResult } from "@/lib/rate-limit";
import { signupUrlIfPlans } from "@/lib/plan-links";

export const runtime = "nodejs";

/**
 * Explicit method-mismatch response so dev and production agree. The framework
 * default (405 on a POST-only route) differs in shape across dev/prod and was
 * once served unreliably by a stale dev server; this pins 405 + JSON + Allow
 * everywhere and is asserted in e2e.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed — use POST" },
    { status: 405, headers: { allow: "POST" } },
  );
}

/**
 * Manual localized-quote send/preview for verification — the only write path
 * the UI needs. Query params:
 *   customerId — required, org-scoped
 *   quoteId    — optional: an invoice id (kind SERVICE/DEAL) to quote verbatim
 *   assemblyId — optional: a price-book assembly; its lines become the quote's
 *                line items, each priced at its standalone or add-on rate
 *   locale     — optional override (en|es|ar|vi); else customer preference
 *   preview=1  — return rendered HTML/text without sending
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const orgId = session.organizationId;

  // Email-sending surface — 20 sends/org/hour keeps a runaway UI loop from
  // burning the Resend free tier or spamming customers.
  const rl = rateLimitResult(`quotes:${orgId}`, 20, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quote send limit reached — try again in ${rl.retryAfterSecs}s.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }

  const body = await req.json().catch(() => null);
  const customerId = typeof body?.customerId === "string" ? body.customerId : null;
  const quoteId = typeof body?.quoteId === "string" ? body.quoteId : null;
  const assemblyId = typeof body?.assemblyId === "string" ? body.assemblyId : null;
  const override = isLocale(body?.locale) ? (body.locale as string) : null;
  const preview = Boolean(body?.preview);

  if (!customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 });

  const delivery = await resolveQuoteDelivery(orgId, customerId, override);
  if (!delivery) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Build the payload from an existing invoice (its line items verbatim),
  // from a price-book assembly (lines priced per-line at standalone/add-on
  // rates), or from the request body for ad-hoc quotes constructed by the UI.
  let quote: QuotePayload | null = null;
  if (assemblyId) {
    const [asm] = await sql`
      select a.name, a.description from service_assemblies a
      where a.id = ${assemblyId} and a.organization_id = ${orgId}`;
    if (!asm) return NextResponse.json({ error: "Assembly not found" }, { status: 404 });
    const lines = await sql`
      select o.name, o.description, o.parts_cost, o.labor_hours,
        o.labor_rate_standalone, o.labor_rate_addon, i.pricing_mode
      from service_assembly_items i
      join service_offerings o on o.id = i.offering_id
      where i.assembly_id = ${assemblyId}
      order by i.position asc`;
    if (!lines.length) return NextResponse.json({ error: "Assembly has no lines" }, { status: 422 });
    const items = lines.map((r) => {
      const hours = Number(r.labor_hours) || 1;
      const rate = r.pricing_mode === "ADDON" ? Number(r.labor_rate_addon) : Number(r.labor_rate_standalone);
      const labor = rate * hours;
      const parts = Number(r.parts_cost) || 0;
      const modeTag = r.pricing_mode === "ADDON" ? " (add-on rate)" : "";
      return { description: `${r.name}${modeTag} — ${hours}h${parts ? ` + ${r.name} parts` : ""}`.slice(0, 200), amount: Math.round((labor + parts) * 100) / 100 };
    });
    quote = {
      customerName: delivery.name,
      customerEmail: delivery.email,
      title: typeof body?.title === "string" && body.title.trim()
        ? body.title.slice(0, 120)
        : `Bundle — ${asm.name}`,
      items,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 500) : (asm.description ?? null),
      validUntil: null,
    };
  } else if (quoteId) {
    const [inv] = await sql`
      select i.number, i.due_at, c.name as customer_name, c.email as customer_email
      from invoices i join customers c on c.id = i.customer_id
      where i.id = ${quoteId} and i.organization_id = ${orgId}`;
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const items = await sql`
      select description, amount from invoice_items where invoice_id = ${quoteId}`;
    quote = {
      customerName: inv.customer_name,
      customerEmail: inv.customer_email,
      title: `Quote ${inv.number}`,
      items: items.map((r) => ({ description: r.description, amount: Number(r.amount) })),
      validUntil: inv.due_at ? new Date(inv.due_at).toLocaleDateString() : null,
    };
  } else if (Array.isArray(body?.options)) {
    // Multi-option quote (Good–Better–Best): 2–4 named choices, one click
    // each in the email. Recorded in quote_responses with a secret token so
    // the decision page /q/<token> works without customer sign-in.
    type RawOpt = { name?: unknown; amount?: unknown; note?: unknown };
    const KEYS = ["A", "B", "C", "D"];
    const options = (body.options as RawOpt[])
      .filter((o: RawOpt) => typeof o?.name === "string" && o.name.trim() && typeof o?.amount === "number" && Number.isFinite(o.amount))
      .slice(0, 4)
      .map((o: RawOpt, idx: number) => ({
        key: KEYS[idx],
        name: (o.name as string).trim().slice(0, 120),
        amount: Math.round((o.amount as number) * 100) / 100,
        note: typeof o.note === "string" && o.note.trim() ? (o.note as string).trim().slice(0, 200) : null,
      }));
    if (options.length < 2) return NextResponse.json({ error: "Two or more options required" }, { status: 400 });
    const [row] = await sql`
      insert into quote_responses (organization_id, customer_id, title, options, locale)
      values (${orgId}, ${customerId}, ${typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Your quote"},
              ${sql.json(options as unknown as Record<string, string>[])}, ${quoteLocale(delivery.locale)})
      returning token`;
    const appUrl = (process.env.APP_URL ?? "http://localhost:3210").replace(/\/+$/, "");
    quote = {
      customerName: delivery.name,
      customerEmail: delivery.email,
      title: typeof body?.title === "string" ? body.title.slice(0, 120) : "Your quote",
      items: [],
      options: options.map((o) => ({ ...o, key: o.key })),
      decisionUrl: `${appUrl}/q/${row?.token}`,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 500) : null,
      validUntil: typeof body?.validUntil === "string" ? body.validUntil : null,
    };
  } else if (Array.isArray(body?.items)) {
    const items = body.items
      .filter((i: { description?: unknown; amount?: unknown }) => typeof i?.description === "string" && typeof i?.amount === "number")
      .slice(0, 50)
      .map((i: { description: string; amount: number }) => ({ description: i.description.slice(0, 200), amount: i.amount }));
    if (!items.length) return NextResponse.json({ error: "items required" }, { status: 400 });
    quote = {
      customerName: delivery.name,
      customerEmail: delivery.email,
      title: typeof body?.title === "string" ? body.title.slice(0, 120) : "Your quote",
      items,
      notes: typeof body?.notes === "string" ? body.notes.slice(0, 500) : null,
      validUntil: typeof body?.validUntil === "string" ? body.validUntil : null,
    };
  }
  if (!quote) return NextResponse.json({ error: "quoteId or items required" }, { status: 400 });

  const effectiveLocale = quoteLocale(delivery.locale);
  // Tracked plan sign-up CTA — only when the org actually publishes plans.
  const plansUrl = await signupUrlIfPlans(orgId, {
    source: "QUOTE",
    ref: quoteId,
    locale: effectiveLocale,
  });
  if (!preview) {
    if (!quote.customerEmail) {
      return NextResponse.json({ error: "Customer has no email on file" }, { status: 422 });
    }
    // send path below
    const sent = await sendQuoteEmail({ orgId, quote, locale: effectiveLocale, plansUrl });
    return NextResponse.json({ ...quote, ...sent, localeSource: delivery.source });
  }

  return NextResponse.json({
    previewText: renderQuoteText(quote, effectiveLocale, plansUrl),
    previewHtml: renderQuoteHtml(quote, effectiveLocale, undefined, plansUrl),
    locale: effectiveLocale,
    localeSource: delivery.source,
  });
}
