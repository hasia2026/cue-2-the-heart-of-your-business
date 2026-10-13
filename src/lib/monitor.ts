// Lightweight uptime/error monitor — no external SDK. Writes deduped
// error events to Postgres and alerts the operator via the existing
// Resend mailer when a cron heartbeat finds problems.
import { sql } from "./db";
import { sendMail, mailerConnected } from "./mailer";

// FNV-1a in plain JS — deterministic enough for dedupe, and avoids a
// node:crypto import that webpack dev compilation of instrumentation can't
// handle ("node:" scheme is not handled by plugins).
export function fingerprintOf(message: string, digest?: string | null): string {
  const input = `${message}:${digest ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + "-" + input.length.toString(16);
}

export type MonitorEvent = {
  message: string;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  routePath?: string | null;
  routeType?: string | null;
  source?: "SERVER" | "CLIENT";
};

/** Record one error occurrence; recurring (same fingerprint) errors aggregate. */
export async function recordError(e: MonitorEvent): Promise<void> {
  try {
    const fp = fingerprintOf(e.message, e.digest);
    await sql`
      insert into error_events (fingerprint, message, digest, path, method, route_path, route_type, source)
      values (${fp}, ${e.message.slice(0, 500)}, ${e.digest ?? null}, ${e.path ?? null}, ${e.method ?? null},
        ${e.routePath ?? null}, ${e.routeType ?? null}, ${e.source ?? "SERVER"})
      on conflict (fingerprint) do update set
        path = excluded.path,
        route_path = excluded.route_path,
        last_seen_at = now(),
        occurrences = error_events.occurrences + 1`;
  } catch (err) {
    // Never let monitoring fail the request that triggered it.
    console.error("monitor recordError failed", err);
  }
}

/**
 * Probe DB health + count errors since the previous heartbeat. Emails the
 * operator (ALERT_EMAIL) when the DB is down or new errors appeared.
 * Synchronous alerting — called from the cron route so delivery completes
 * within the invocation.
 */
export async function runHeartbeat(): Promise<{ ok: boolean; dbUp: boolean; newErrors: number; alerted: boolean; detail: string }> {
  let dbUp = false;
  let dbDetail: string | null = null;
  try {
    await sql`select 1`;
    dbUp = true;
  } catch (e) {
    dbDetail = `DB down: ${e instanceof Error ? e.message : String(e)}`;
  }

  let newErrors = 0;
  let samples: string[] = [];
  if (dbUp) {
    try {
      const [prev] = await sql`select checked_at from monitor_heartbeats order by checked_at desc limit 1`;
      const since = prev?.checked_at ?? new Date(0);
      const rows = await sql`
        select message, sum(occurrences)::int as total
        from error_events where last_seen_at > ${since}
        group by message order by max(last_seen_at) desc limit 5`;
      for (const r of rows) {
        newErrors += Number(r.total ?? 0);
        samples.push(`${r.total}× ${r.message}`);
      }
    } catch (e) {
      dbDetail = dbDetail ?? `error query failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const ok = dbUp && newErrors === 0;
  const detail =
    dbDetail ??
    (newErrors > 0 ? `${newErrors} new error occurrence(s) since last heartbeat — ${samples.join("; ")}` : "all clear");

  // Alert the operator when something is wrong and email is configured.
  const alertEmail = process.env.ALERT_EMAIL?.trim();
  let alerted = false;
  if (!ok && mailerConnected() && alertEmail) {
    const subject = dbUp ? `CUE monitor: new errors detected (${newErrors})` : `CUE monitor: APP DOWN — database unreachable`;
    const body = `CUE uptime heartbeat ${new Date().toISOString()}\n\nDB: ${dbUp ? "up" : "DOWN"}\nNew errors since last check: ${newErrors}\n\n${detail}\n\nOpen ${process.env.APP_URL ?? ""}/monitor for details.`;
    const mail = await sendMail({ to: alertEmail, subject, text: body });
    if (mail.sent) alerted = true;
  }

  // Heartbeat history (all-heartbeats record even failures — that's the point).
  try {
    await sql`
      insert into monitor_heartbeats (ok, db_up, detail, new_errors, alerted)
      values (${ok}, ${dbUp}, ${detail}, ${newErrors}, ${alerted})`;
  } catch (e) {
    console.error("monitor heartbeat write failed", e);
  }

  return { ok, dbUp, newErrors, alerted, detail };
}
