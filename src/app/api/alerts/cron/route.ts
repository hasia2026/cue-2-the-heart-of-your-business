import { NextRequest, NextResponse } from "next/server";
import { drainLeadAlerts, buildLeadAlertSummary, renderLeadAlertSummary } from "@/lib/lead-queue";
import { sendMail, mailerConnected } from "@/lib/mailer";
import { pilotInboxEmails } from "@/lib/leads";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lead-alert housekeeping cron (vercel.json): 1) drain due retries from
 * lead_alert_queue, 2) email a 24-hour summary (leads in by channel,
 * delivered/pending/parked alerts) to the pilot inbox.
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

  const drain = await drainLeadAlerts();
  const summary = await buildLeadAlertSummary();
  const text = renderLeadAlertSummary(summary);

  if (mailerConnected() && (summary.scans || summary.scoreLeads || summary.pending || summary.parked)) {
    const mail = await sendMail({
      to: pilotInboxEmails(),
      subject: `CUE lead alert summary — ${new Date().toISOString().slice(0, 10)}`,
      text,
    });
    return NextResponse.json({ drain, summary, summaryEmail: mail.sent ? "sent" : mail.error ?? "failed" });
  }
  return NextResponse.json({ drain, summary, summaryEmail: "skipped (nothing to report or mailer off)" });
}
