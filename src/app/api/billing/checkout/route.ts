import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import Stripe from "stripe";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(`${origin}/signin`);

  const key = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!key || !priceId) {
    return NextResponse.redirect(`${origin}/settings?billing=not_configured`);
  }

  const stripe = new Stripe(key);
  const [org] = await sql`select referred_by_code from organizations where id = ${session.organizationId}`;
  const refCode = (org?.referred_by_code as string | null) ?? null;

  // Partner split at purchase time: destination charge, partner share = commission_pct.
  let destination: string | null = null;
  let applicationFeePercent: number | undefined;
  if (refCode) {
    const [partner] = await sql`
      select stripe_account_id, commission_pct from partners
      where code = ${refCode} and status = 'ACTIVE' and stripe_onboarded = true and stripe_account_id is not null`;
    if (partner) {
      destination = partner.stripe_account_id as string;
      applicationFeePercent = 100 - Number(partner.commission_pct);
    }
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/settings?billing=cancelled`,
    subscription_data: {
      metadata: {
        organizationId: session.organizationId,
        refCode: refCode ?? "",
      },
      ...(destination
        ? { transfer_data: { destination }, application_fee_percent: applicationFeePercent }
        : {}),
    },
  });

  return NextResponse.redirect(checkout.url!);
}
