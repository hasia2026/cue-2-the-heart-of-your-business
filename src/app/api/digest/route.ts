import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { buildDigestData, renderDigest, renderDigestHtml, digestBrand } from "@/lib/digest";
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

  // One digest per org that has an owner. Per-org settings (business_profiles
  // .digest_on/.digest_day/.whatsapp_number) decide whether today is the org's
  // send day and where WhatsApp goes; unset = the owner's email only.
  const orgs = await sql`
    select o.id, u.email as owner_email,
           coalesce(bp.digest_on, true) as digest_on,
           coalesce(bp.digest_day, 1) as digest_day,
           bp.whatsapp_number
    from organizations o
    join members m on m.organization_id = o.id and m.role = 'OWNER'
    join users u on u.id = m.user_id
    left join business_profiles bp on bp.organization_id = o.id`;

  const todayDow = new Date().getUTCDay();
  const results = [];
  for (const org of orgs) {
    try {
      if (!org.digest_on || org.digest_day !== todayDow) {
        results.push({ org: org.id, skipped: "not this org's send day (or digest off)" });
        continue;
      }
      const data = await buildDigestData(org.id);
      const text = renderDigest(data);
      const html = renderDigestHtml(data, await digestBrand(org.id, data.orgName));
      const mail = mailerConnected()
        ? await sendMail({ to: org.owner_email, subject: `CUE weekly digest — ${data.orgName}`, text, html })
        : { connected: false, sent: false, error: "Email not connected (RESEND_API_KEY missing)" };

      let whatsapp: { sent: boolean; error?: string } | null = null;
      if (whatsappConnected()) {
        // Owner's captured WhatsApp number wins; WHATSAPP_DIGEST_TO stays as a
        // single-org escape hatch for operators who never captured one.
        const waTo = String(org.whatsapp_number ?? "").trim() || process.env.WHATSAPP_DIGEST_TO?.trim();
        if (waTo) whatsapp = await sendWhatsAppText(waTo, text);
      }

      await logAudit({
        organizationId: org.id,
        actorType: "SYSTEM",
        action: "DIGEST_SENT",
        detail: mailerConnected() ? `weekly digest sent (day ${org.digest_day})` : "weekly digest generated (email not connected)",
        metadata: { email: mail.sent, whatsapp: whatsapp?.sent ?? false, html: !!html },
      });
      results.push({ org: data.orgName, email: mail.sent || mailerConnected() ? mail : "not connected", whatsapp: whatsapp?.sent ?? "not configured" });
    } catch (e) {
      results.push({ org: org.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
