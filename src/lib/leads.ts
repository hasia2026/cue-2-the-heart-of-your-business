// Pilot-request routing — every public "I want a pilot / scan call" touchpoint
// (flyer QR scan form, /score completion, /book email fallback, /partners mailto)
// funnels to ONE inbox so nothing lands in an alias nobody is watching.
//
// PILOT_REQUEST_EMAIL accepts a comma/semicolon-separated LIST (e.g.
// "shannon102501@gmail.com,pilots@hasi.tech"); the built-in default is the
// owner's direct address so routing never depends on remembering to set a var.
// pilots@hasi.tech becomes deliverable once the hasi.tech sending domain is
// verified in Resend — see docs/resend-domain-dns.md.
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
};

function requestText(req: PilotRequest): string {
  const source = req.source ?? "FLYER";
  return [
    `New pilot request via ${source}.`,
    ``,
    `Name:  ${req.name}`,
    `Shop:  ${req.shop}`,
    `Phone: ${req.phone}`,
    `Email: ${req.email ?? "(none given)"}`,
    ``,
    `Inbox of record: Pipeline → Scan records. Follow up within one business day.`,
  ].join("\n");
}

/**
 * Fire-and-forget "you got a pilot request" alert to the inbox list (email)
 * plus every registered device (Web Push "whisper"). Never throws and never
 * blocks the public submit: the lead row is the system of record. Email
 * failures are persisted to lead_alert_queue for cron retries; push failures
 * are logged (stale endpoints are pruned on 410).
 */
export async function notifyPilotRequest(req: PilotRequest): Promise<void> {
  const { sendMail, mailerConnected, mailFrom } = await import("@/lib/mailer");
  const targets = pilotInboxEmails();
  const subject = `New CUE pilot request — ${req.name} (${req.shop})`;
  const text = requestText(req);

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
    const pushed = await pushPilotAlert(`Pilot request: ${req.name}`, `${req.shop} · ${req.phone}${req.email ? ` · ${req.email}` : ""}`, `/pipeline/scan-leads`);
    if (!pushed.ok) console.warn("pilot request push inconclusive:", pushed.detail);
  } catch (e) {
    console.warn("pilot request push failed:", e instanceof Error ? e.message : String(e));
  }
}

/** Persist a failed email attempt; retry later (exponential backoff) via cron. */
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
