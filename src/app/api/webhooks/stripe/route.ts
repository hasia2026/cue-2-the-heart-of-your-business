import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import Stripe from "stripe";

// Stripe-signed webhook. Signature requires the RAW body — no JSON parsing first.
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) {
    return NextResponse.json({ received: false, reason: "stripe not configured" }, { status: 503 });
  }
  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Partner onboarding confirmed by Stripe
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        if (account.payouts_enabled && account.metadata?.partnerCode) {
          await sql`
            update partners set stripe_onboarded = true
            where code = ${account.metadata.partnerCode} and stripe_account_id = ${account.id}`;
        }
        break;
      }

      // Recurring commission: every paid invoice of a referred subscription
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // newer SDK Invoice types omit `subscription`; read it defensively
        const rawSub = (invoice as unknown as { subscription?: string | { id?: string } }).subscription;
        const subId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (!subId || invoice.amount_paid <= 0) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const orgId = sub.metadata?.organizationId ?? "";
        const refCode = sub.metadata?.refCode ?? "";
        if (!orgId || !refCode) break;

        const [partner] = await sql`
          select id, commission_pct from partners where code = ${refCode} and status = 'ACTIVE'`;
        if (!partner) break;

        const commission = Math.round((invoice.amount_paid * Number(partner.commission_pct)) / 100);
        if (commission <= 0) break;

        // Idempotent per invoice: skip if this invoice was already credited
        const [dupe] = await sql`
          select 1 from payout_ledger
          where organization_id = ${orgId} and stripe_transfer_id = ${`inv:${invoice.id}`}
          limit 1`;
        if (!dupe) {
          await sql`
            insert into payout_ledger (partner_id, organization_id, invoice_amount_cents, commission_cents, stripe_transfer_id, status)
            values (${partner.id}, ${orgId}, ${invoice.amount_paid}, ${commission}, ${`inv:${invoice.id}`}, 'ACCRUED')`;
        }
        break;
      }

      // Refund clawback: reverse accrued commissions for the refunded customer's org
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const orgId = charge.metadata?.organizationId;
        if (!orgId) break;
        const reversed = await sql`
          update payout_ledger set status = 'REVERSED'
          where organization_id = ${orgId} and status = 'ACCRUED'
          returning partner_id, commission_cents`;
        for (const row of reversed) {
          await sql`
            insert into payout_ledger (partner_id, organization_id, invoice_amount_cents, commission_cents, kind, status)
            values (${row.partner_id}, ${orgId}, 0, ${-Number(row.commission_cents)}, 'REFUND_REVERSAL', 'REVERSED')`;
        }
        break;
      }
    }
  } catch (err) {
    // Never 500-throw after signature verification; log and ack so Stripe doesn't hot-loop.
    console.error("stripe webhook handler error", event.type, err);
  }

  return NextResponse.json({ received: true });
}
