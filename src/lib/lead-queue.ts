// Retry drain + daily summary for pilot-request email alerts.
//
// Enqueue happens at send failure (lib/leads.ts). This module drains due rows
// with exponential backoff (30m → 1h → 2h → … → 24h cap), abandons after the
// 8th attempt, and compiles the daily summary the alert cron emails to the
// pilot inbox.
import { sql } from "@/lib/db";
import { sendMail, mailerConnected } from "@/lib/mailer";

type Row = {
  id: number;
  attempts: number;
  target: string;
  payload: { subject?: string; text?: string; targets?: string[] };
};

export type DrainResult = { attempted: number; delivered: number; parked: number; failed: number };

/**
 * One drain pass over due undelivered rows. `for update skip locked` keeps a
 * self-overlapping cron or another worker from double-sending a row.
 */
export async function drainLeadAlerts(limit = 25): Promise<DrainResult> {
  const due = await sql<Row[]>`
    select id::int, attempts, target, payload
    from lead_alert_queue
    where delivered_at is null and next_attempt_at <= now()
    order by id
    limit ${limit}
    for update skip locked`;

  const result: DrainResult = { attempted: 0, delivered: 0, parked: 0, failed: 0 };

  for (const row of due) {
    result.attempted += 1;
    const targets = row.payload.targets ?? row.target.split(",").map((s) => s.trim());
    const subject = row.payload.subject ?? "New CUE pilot request";
    const text = row.payload.text ?? "";

    try {
      const prov = mailerConnected()
        ? await sendMail({ to: targets, subject, text })
        : { connected: false, sent: false, error: "RESEND_API_KEY not set" };
      if (prov.sent) {
        result.delivered += 1;
        await sql`update lead_alert_queue set delivered_at = now(), attempts = attempts + 1, last_error = null where id = ${row.id}`;
        continue;
      }
      await failRow(row, prov.error ?? "send failed (provider rejected)", result);
    } catch (e) {
      await failRow(row, e instanceof Error ? e.message : String(e), result);
    }
  }
  return result;
}

// 30m, 1h, 2h, 4h, 8h, then daily — ~1 business day of trying, then parked.
const BACKOFF_MIN = [30, 60, 120, 240, 480, 1440, 1440];

async function failRow(row: Row, error: string, result: DrainResult): Promise<void> {
  const attempts = row.attempts + 1;
  if (attempts >= 8) {
    result.parked += 1; // abandoned — stays undelivered, shows in the daily summary
    await sql`update lead_alert_queue set attempts = 8, last_error = ${("abandoned after 8 attempts. last: " + error).slice(0, 500)}, next_attempt_at = now() + interval '7 days' where id = ${row.id}`;
    return;
  }
  const backoff = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
  await sql`update lead_alert_queue set attempts = ${attempts}, last_error = ${error.slice(0, 500)}, next_attempt_at = now() + (${backoff} * interval '1 minute') where id = ${row.id}`;
  result.failed += 1;
}

export type SummaryData = {
  scanBySource: { source: string; n: number }[];
  scans: number;
  scoreLeads: number;
  pending: number;
  oldestPendingHours: number | null;
  delivered24h: number;
  retried24h: number;
  parked: number;
};

export async function buildLeadAlertSummary(): Promise<SummaryData> {
  const bySource = await sql`
    select coalesce(source, 'FLYER') as source, count(*)::int as n
    from scan_leads
    where created_at > now() - interval '24 hours'
    group by 1 order by n desc`;
  const [totals] = await sql`
    select count(*)::int as n from scan_leads where created_at > now() - interval '24 hours'`;
  const [score] = await sql`
    select count(*)::int as n from score_leads where created_at > now() - interval '24 hours'`;
  const [pending] = await sql`
    select count(*)::int as n,
           extract(epoch from coalesce(max(now() - next_attempt_at), '0 sec'))::int as oldest_secs
    from lead_alert_queue
    where delivered_at is null and next_attempt_at <= now()`;
  const [delivered] = await sql`
    select count(*)::int as n from lead_alert_queue where delivered_at > now() - interval '24 hours'`;
  const [retried] = await sql`
    select count(*)::int as n from lead_alert_queue
    where delivered_at is null and attempts > 0 and created_at > now() - interval '24 hours'`;
  const [parkedRow] = await sql`
    select count(*)::int as n from lead_alert_queue where delivered_at is null and attempts >= 8`;

  return {
    scanBySource: bySource.map((r) => ({ source: r.source, n: Number(r.n) })),
    scans: Number(totals?.n ?? 0),
    scoreLeads: Number(score?.n ?? 0),
    pending: Number(pending?.n ?? 0),
    oldestPendingHours: pending?.oldest_secs != null ? Math.floor(Number(pending.oldest_secs) / 3600) : null,
    delivered24h: Number(delivered?.n ?? 0),
    retried24h: Number(retried?.n ?? 0),
    parked: Number(parkedRow?.n ?? 0),
  };
}

export function renderLeadAlertSummary(d: SummaryData): string {
  const lines: string[] = [
    "CUE lead alerts — last 24 hours",
    "",
    `Pilot requests (scan form): ${d.scans}${d.scanBySource.length ? ` (${d.scanBySource.map((l) => `${l.n} ${l.source}`).join(", ")})` : ""}`,
    `Revenue Leak Score completions: ${d.scoreLeads}`,
    "",
    `Alert emails delivered: ${d.delivered24h}`,
    `Alert emails pending retry: ${d.pending}${d.pending && d.oldestPendingHours != null && d.oldestPendingHours > 0 ? ` (oldest waiting ${d.oldestPendingHours}h)` : ""}`,
    `Alert emails parked (8 attempts): ${d.parked}`,
  ];
  if (d.pending || d.parked) lines.push("", `⚠ Undelivered alerts exist — check server logs for the provider error shown under lead_alert_queue.last_error.`);
  if (!d.scans && !d.scoreLeads && !d.pending && !d.parked) lines.push("", "Quiet day: no leads, no alert failures.");
  return lines.join("\n");
}
