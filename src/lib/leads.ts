// Pilot-request routing — every public "I want a pilot / scan call" touchpoint
// (flyer QR scan form, /score completion, /book email fallback, /partners mailto)
// funnels to ONE inbox so nothing lands in an alias nobody is watching.
//
// PILOT_REQUEST_EMAIL accepts a comma/semicolon-separated LIST (e.g.
// "shannon102501@gmail.com,pilots@hasi.tech"); the built-in default is the
// owner's direct address so routing never depends on remembering to set a var.
// pilots@hasi.tech becomes deliverable once the hasi.tech sending domain is
// verified in Resend — see docs/resend-domain-dns.md.
import type { SendResult } from "./mailer";

const DEFAULT_PILOT_INBOX = "shannon102501@gmail.com";

/** Inbox list, trimmed and de-duplicated, in configured order. */
export function pilotInboxEmails(): string[] {
  const raw = process.env.PILOT_REQUEST_EMAIL?.trim();
  const list = raw ? raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) : [DEFAULT_PILOT_INBOX];
  return [...new Set(list)].length ? [...new Set(list)] : [DEFAULT_PILOT_INBOX];
}

export function pilotInboxEmail(): string {
  return pilotInboxEmails()[0];
}

export function pilotInboxMailto(subject: string): string {
  return `mailto:${pilotInboxEmail()}?subject=${encodeURIComponent(subject)}`;
}

export type PilotRequest = {
  name: string;
  shop: string;
  phone: string;
  email?: string;
  source?: string;
  preferredTime?: string;
};

/** Normalize current and legacy slot text: "(requested)" and "Requested: …". */
export function cleanSlot(value: string): string {
  return value
    .replace(/\s*\((?:requested|request)\)\s*$/i, "")
    .replace(/^\s*requested\b\s*[:\-–—]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

function requestText(req: PilotRequest, slot: string): string {
  const source = req.source ?? "FLYER";
  return [
    `New pilot request via ${source}.`,
    ``,
    `Name:  ${req.name}`,
    `Shop:  ${req.shop}`,
    `Phone: ${req.phone}`,
    `Email: ${req.email ?? "(none given)"}`,
    ...(slot ? [`Requested: ${slot}`] : []),
    ``,
    `Inbox of record: Pipeline → Scan records. Follow up within one business day.`,
  ].join("\n");
}

export type BookingConfirmation = {
  name: string;
  email: string;
  shop: string;
  preferredTime: string;
};

const BOOKING_COPY = {
  slotLabel: "Requested slot",
  nextStepsHeading: "What happens next",
  nextSteps: [
    "A real person will confirm this slot by email or text within one business hour.",
    "If the time has already passed or no longer works, we'll offer the nearest available time.",
    "On the call, have one month of jobs, quotes, or invoices ready to export or photograph. We'll run the scan live on your numbers and show you where money is leaking.",
    "The call is 20 minutes, with no pitch deck. If we don't find $1,000 in documented leaks, the pilot is free.",
  ],
  changeTime: "Need to change the time? Reply to this email and we'll move it.",
  signoff: "— CUE",
  intro: "We received your request for a free 20-minute CUE scan call for",
} as const;

function confirmationText(req: BookingConfirmation, slot: string): string {
  return [
    `Hi ${req.name},`,
    ``,
    `${BOOKING_COPY.intro} ${req.shop}.`,
    ``,
    `${BOOKING_COPY.slotLabel}: ${slot}`,
    ``,
    BOOKING_COPY.nextStepsHeading,
    ...BOOKING_COPY.nextSteps.map((step, index) => `${index + 1}. ${step}`),
    ``,
    BOOKING_COPY.changeTime,
    ``,
    BOOKING_COPY.signoff,
  ].join("\n");
}

function confirmationHtml(req: BookingConfirmation, slot: string): string {
  const name = escapeHtml(req.name);
  const shop = escapeHtml(req.shop);
  const nextSteps = BOOKING_COPY.nextSteps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("\n        ");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:.08em;color:#7c3aed;">CUE</p>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">Your scan call is requested</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">${BOOKING_COPY.intro} <strong>${shop}</strong>.</p>
      <div style="margin:0 0 24px;padding:16px 20px;border:1px solid #ddd6fe;border-radius:12px;background:#f5f3ff;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6d28d9;">${BOOKING_COPY.slotLabel}</div>
        <div style="margin-top:4px;font-size:20px;font-weight:700;color:#4c1d95;">${escapeHtml(slot)}</div>
      </div>
      <h2 style="margin:0 0 12px;font-size:18px;">${BOOKING_COPY.nextStepsHeading}</h2>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.7;">
        ${nextSteps}
      </ol>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(BOOKING_COPY.changeTime)}</p>
      <p style="margin:24px 0 0;font-size:15px;color:#475569;">${escapeHtml(BOOKING_COPY.signoff)}</p>
    </div>
  </body>
</html>`;
}

/** Automatic visitor confirmation for a slot booking. Never blocks the saved lead. */
export async function sendBookingConfirmation(req: BookingConfirmation): Promise<SendResult> {
  const { sendMail, mailerConnected } = await import("@/lib/mailer");
  if (!mailerConnected()) {
    console.warn("booking confirmation skipped — RESEND_API_KEY not set (lead still saved)");
    return { connected: false, sent: false, error: "RESEND_API_KEY not set" };
  }

  const slot = cleanSlot(req.preferredTime);
  if (!slot) return { connected: true, sent: false, error: "No requested slot" };

  const subject = `CUE scan call requested — ${slot}`;
  const text = confirmationText(req, slot);
  const html = confirmationHtml(req, slot);
  const result = await sendMail({
    to: req.email,
    replyTo: pilotInboxEmail(),
    subject,
    text,
    html,
  });

  if (!result.sent) {
    // Never queue a visitor slot confirmation for retry: it is time-sensitive,
    // and the owner-alert queue does not preserve the reply-to address. The
    // API response tells the visitor it failed; keep the server log for follow-up.
    console.error("booking confirmation failed:", result.error ?? "unknown mailer error");
  }
  return result;
}

/**
 * Fire-and-forget "you got a pilot request" alert to the inbox list (email)
 * plus every registered device (Web Push "whisper"). Never throws and never
 * blocks the public submit: the lead row is the system of record. Email
 * failures are persisted to lead_alert_queue for cron retries; push failures
 * are logged (stale endpoints are pruned on 410).
 */
export async function notifyPilotRequest(req: PilotRequest): Promise<void> {
  const { sendMail, mailerConnected } = await import("@/lib/mailer");
  const targets = pilotInboxEmails();
  const slot = cleanSlot(req.preferredTime ?? "");
  const subject = `New CUE pilot request — ${req.name} (${req.shop})${slot ? ` — ${slot}` : ""}`;
  const text = requestText(req, slot);

  if (!mailerConnected()) {
    console.warn("pilot request notify skipped — RESEND_API_KEY not set (lead still saved)");
    return;
  }
  try {
    const result = await sendMail({ to: targets, subject, text });
    if (!result.sent) {
      console.error("pilot request notify failed:", result.error ?? "unknown mailer error");
      if (result.connected) await enqueueFailedAlert(targets, subject, text, result.error ?? "unknown mailer error");
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("pilot request notify failed:", err);
    await enqueueFailedAlert(targets, subject, text, err);
  }

  // Real-time whisper — best effort, logged, never blocks.
  try {
    const { pushPilotAlert } = await import("@/lib/push");
    const title = `Pilot request: ${req.name}`;
    const body = `${slot ? `Requested: ${slot} · ` : ""}${req.shop} · ${req.phone}${req.email ? ` · ${req.email}` : ""}`;
    const pushed = await pushPilotAlert(title, body, `/pipeline/scan-leads`);
    if (!pushed.ok) console.warn("pilot request push inconclusive:", pushed.detail);
  } catch (e) {
    console.warn("pilot request push failed:", e instanceof Error ? e.message : String(e));
  }
}

/** Persist a failed owner alert; retry later (exponential backoff) via cron.
 *  Visitor slot confirmations are intentionally not routed here. */
export async function enqueueFailedAlert(
  targets: string[],
  subject: string,
  text: string,
  error: string,
): Promise<void> {
  try {
    const { sql } = await import("@/lib/db");
    await sql`
      insert into lead_alert_queue (channel, target, payload, attempts, last_error)
      values ('EMAIL', ${targets.join(", ")}, ${sql.json({ subject, text, targets })}, 0, ${error.slice(0, 500)})`;
  } catch (e) {
    // Queue write is itself best-effort; the error is already in the server log.
    console.error("lead_alert_queue insert failed:", e instanceof Error ? e.message : String(e));
  }
}
