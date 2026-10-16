import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import Stripe from "stripe";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";

// Public GET that mints Stripe account links — cheap-to-forged surface, so
// 10 starts/hour/IP. Legit partners onboarding need at most a few; a flooder
// wastes Stripe API calls and could trip their rate limits for real users.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/partners`);

  const rl = rateLimitResult(clientKey(req, "partners"), 10, 3600_000);
  if (!rl.ok) {
    return NextResponse.redirect(`${origin}/partners?connect=rate_limited`);
  }

  const [partner] = await sql`
    select id, stripe_account_id from partners where code = ${code} and status = 'ACTIVE'`;
  if (!partner) return NextResponse.redirect(`${origin}/partners`);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.redirect(`${origin}/partners?code=${code}&err=stripe`);

  const stripe = new Stripe(key);
  let accountId = (partner.stripe_account_id as string | null) ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      metadata: { partnerCode: code, platform: "CUE" },
    });
    accountId = account.id;
    await sql`update partners set stripe_account_id = ${accountId} where id = ${partner.id}`;
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/api/partners/connect?code=${code}`,
    return_url: `${origin}/partners?code=${code}&onboarded=1`,
    type: "account_onboarding",
  });
  return NextResponse.redirect(link.url);
}
