import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pushPilotAlert } from "@/lib/push";
import { pilotInboxEmails } from "@/lib/leads";
import { sendMail, mailerConnected } from "@/lib/mailer";

export const runtime = "nodejs";

/** Owner-only: send one test alert through the push channel (and one test email). */
export async function POST() {
  const session = await getSession();
  if (!session || session.role === "MEMBER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  const push = await pushPilotAlert(
    "CUE test ping",
    "If you see this within a minute of sending, the whisper channel works.",
    "/pipeline/scan-leads",
  );
  let email: string = "skipped";
  if (mailerConnected()) {
    const mail = await sendMail({
      to: pilotInboxEmails(),
      subject: "TEST — CUE lead alert path",
      text: "One-time test from Pipeline → Scan-call leads. Real pilot alerts arrive as: 'New CUE pilot request — Name (Shop)'.",
    });
    email = mail.sent ? "sent" : mail.error ?? "failed";
  } else {
    email = "not configured (RESEND_API_KEY missing)";
  }
  return NextResponse.json({
    sent: push.sent,
    pruned: push.pruned,
    pushDetail: push.detail ?? "pushed",
    email,
  });
}
