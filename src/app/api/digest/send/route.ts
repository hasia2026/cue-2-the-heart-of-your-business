import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildDigestData, renderDigest } from "@/lib/digest";
import { mailerConnected, sendMail } from "@/lib/mailer";
import { whatsappConnected, sendWhatsAppText } from "@/lib/whatsapp";

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
  const subject = `CUE weekly digest — ${data.orgName}`;

  const url = new URL(req.url);
  if (url.searchParams.get("preview")) {
    return NextResponse.json({ preview: text });
  }

  const mail = mailerConnected()
    ? await sendMail({ to: session.user.email, subject, text })
    : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };

  let whatsapp: { sent: boolean; error?: string } | null = null;
  if (whatsappConnected()) {
    const waTo = process.env.WHATSAPP_DIGEST_TO?.trim();
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
  const data = await buildDigestData(session.organizationId);
  const text = renderDigest(data);
  const mail = mailerConnected()
    ? await sendMail({ to: session.user.email, subject: `CUE weekly digest — ${data.orgName}`, text })
    : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };
  return NextResponse.json({ sent: mail.sent, error: mail.error ?? null, preview: text });
}
