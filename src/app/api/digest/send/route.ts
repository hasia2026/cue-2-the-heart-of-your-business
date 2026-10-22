import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { buildDigestData, renderDigest, renderDigestHtml, digestBrand } from "@/lib/digest";
import { mailerConnected, sendMail } from "@/lib/mailer";
import { whatsappConnected, sendWhatsAppText } from "@/lib/whatsapp";
import { rateLimitResult } from "@/lib/rate-limit";
import { signupUrlIfPlans } from "@/lib/plan-links";

export const runtime = "nodejs";

/**
 * Manual send/preview for verification — same builder as the cron route.
 *   ?preview=1 → returns the compiled digest text (no send)
 *   default    → sends email (and WhatsApp when connected) to the signed-in owner
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const data = await buildDigestData(session.organizationId);
  const text = renderDigest(data);
  // Tracked plan CTA attributed to this digest send (ISO date as the week ref).
  const plansUrl = await signupUrlIfPlans(session.organizationId, {
    source: "DIGEST",
    ref: new Date().toISOString().slice(0, 10),
  });
  const html = renderDigestHtml(data, await digestBrand(session.organizationId, data.orgName), plansUrl);
  const subject = `CUE weekly digest — ${data.orgName}`;

  const url = new URL(req.url);
  if (url.searchParams.get("preview")) {
    return NextResponse.json({ preview: text });
  }

  const mail = mailerConnected()
    ? await sendMail({ to: session.user.email, subject, text, html })
    : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };

  let whatsapp: { sent: boolean; error?: string } | null = null;
  if (whatsappConnected()) {
    // Same precedence as the cron route: captured owner number first.
    const [profile] = await sql`
      select whatsapp_number from business_profiles where organization_id = ${session.organizationId}`;
    const waTo = String(profile?.whatsapp_number ?? "").trim() || process.env.WHATSAPP_DIGEST_TO?.trim();
    if (waTo) whatsapp = await sendWhatsAppText(waTo, text);
  }

  return NextResponse.json({ sent: mail.sent, whatsapp: whatsapp?.sent ?? "not configured", preview: text });
}

/** Owner-only manual trigger: POST sends the digest to the signed-in owner's email. */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  // This POST sends mail (and WhatsApp) — 10/hour/org stops a client hammering
  // the endpoint into a resend storm against the free email tier.
  const rl = rateLimitResult(`digest:${session.organizationId}`, 10, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Digest send limit reached — try again in ${rl.retryAfterSecs}s.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }
  const data = await buildDigestData(session.organizationId);
  const text = renderDigest(data);
  const plansUrl = await signupUrlIfPlans(session.organizationId, {
    source: "DIGEST",
    ref: new Date().toISOString().slice(0, 10),
  });
  const html = renderDigestHtml(data, await digestBrand(session.organizationId, data.orgName), plansUrl);
  const mail = mailerConnected()
    ? await sendMail({ to: session.user.email, subject: `CUE weekly digest — ${data.orgName}`, text, html })
    : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };
  return NextResponse.json({ sent: mail.sent, error: mail.error ?? null, preview: text });
}
