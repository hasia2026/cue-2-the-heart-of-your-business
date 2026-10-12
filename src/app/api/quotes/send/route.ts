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

export const runtime = "nodejs";

/**
 * Manual localized-quote send/preview for verification — the only write path
 * the UI needs. Query params:
 *   customerId — required, org-scoped
 *   quoteId    — optional: an invoice id (kind SERVICE/DEAL) to quote verbatim
 *   locale     — optional override (en|es|ar|vi); else customer preference
 *   preview=1  — return rendered HTML/text without sending
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const orgId = session.organizationId;

  const body = await req.json().catch(() => null);
  const customerId = typeof body?.customerId === "string" ? body.customerId : null;
  const quoteId = typeof body?.quoteId === "string" ? body.quoteId : null;
  const override = isLocale(body?.locale) ? (body.locale as string) : null;
  const preview = Boolean(body?.preview);

  if (!customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 });

  const delivery = await resolveQuoteDelivery(orgId, customerId, override);
  if (!delivery) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Build the payload from an existing invoice (its line items verbatim) or
  // from the request body for ad-hoc quotes constructed by the UI.
  let quote: QuotePayload | null = null;
  if (quoteId) {
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
  if (!preview) {
    if (!quote.customerEmail) {
      return NextResponse.json({ error: "Customer has no email on file" }, { status: 422 });
    }
    // send path below
    const sent = await sendQuoteEmail({ orgId, quote, locale: effectiveLocale });
    return NextResponse.json({ ...quote, ...sent, localeSource: delivery.source });
  }

  return NextResponse.json({
    previewText: renderQuoteText(quote, effectiveLocale),
    previewHtml: renderQuoteHtml(quote, effectiveLocale),
    locale: effectiveLocale,
    localeSource: delivery.source,
  });
}
