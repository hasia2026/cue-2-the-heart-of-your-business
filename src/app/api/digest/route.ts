import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { buildDigestData, renderDigest } from "@/lib/digest";
import { mailerConnected, sendMail } from "@/lib/mailer";
import { whatsappConnected, sendWhatsAppText } from "@/lib/whatsapp";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Weekly owner digest. Vercel Cron hits here Mondays 08:00 UTC (vercel.json);
 * Authorization: Bearer CRON_SECRET guards it in production.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  // One digest per org that has an owner to receive it.
  const orgs = await sql`
    select o.id, u.email as owner_email
    from organizations o
    join members m on m.organization_id = o.id and m.role = 'OWNER'
    join users u on u.id = m.user_id`;

  const results = [];
  for (const org of orgs) {
    try {
      const data = await buildDigestData(org.id);
      const text = renderDigest(data);
      const mail = mailerConnected()
        ? await sendMail({ to: org.owner_email, subject: `CUE weekly digest — ${data.orgName}`, text })
        : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };

      let whatsapp: { sent: boolean; error?: string } | null = null;
      if (whatsappConnected()) {
        // Owner's WhatsApp number lives in WHATSAPP_DIGEST_TO (opt-in number); skip when unset.
        const waTo = process.env.WHATSAPP_DIGEST_TO?.trim();
        if (waTo) whatsapp = await sendWhatsAppText(waTo, text);
      }

      await logAudit({
        organizationId: org.id,
        actorType: "SYSTEM",
        action: "DIGEST_SENT",
        detail: mailerConnected() ? "weekly digest sent" : "weekly digest generated (email not connected)",
        metadata: { email: mail.sent, whatsapp: whatsapp?.sent ?? false },
      });
      results.push({ org: data.orgName, email: mail.sent || mailerConnected() ? mail : "not connected", whatsapp: whatsapp?.sent ?? "not configured" });
    } catch (e) {
      results.push({ org: org.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
