import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { mailerConnected } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const session = await requireSession();
  if (session.role !== "OWNER") {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Monitor</h1>
        <div className="card p-5 muted">Owner access only — this page shows platform health and error history.</div>
      </div>
    );
  }

  const [errors, beats] = await Promise.all([
    sql`select message, digest, path, method, route_type as "routeType", source, occurrences,
               first_seen_at as "firstSeen", last_seen_at as "lastSeen"
        from error_events order by last_seen_at desc limit 50`,
    sql`select ok, db_up as "dbUp", detail, new_errors as "newErrors", alerted, checked_at as "checkedAt"
        from monitor_heartbeats order by checked_at desc limit 20`,
  ]);

  const alive = beats.length > 0 && beats[0].dbUp;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Monitor</h1>
        <p className="page-sub">Platform health, captured errors and heartbeat history. Alerts go to ALERT_EMAIL when a heartbeat finds problems.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs tracking-widest text-navy-300">STATUS</div>
          <div className={`mt-2 text-2xl font-bold ${alive ? "text-emerald-400" : "text-rose-400"}`}>
            {alive ? "UP" : errors.length ? "CHECK" : "NO DATA"}
          </div>
          <div className="muted text-xs mt-1">{beats.length ? `Last heartbeat ${new Date(beats[0].checkedAt).toLocaleString()}` : "No heartbeat yet — cron runs daily"}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs tracking-widest text-navy-300">DISTINCT ERRORS</div>
          <div className="mt-2 text-2xl font-bold text-white">{errors.length}</div>
          <div className="muted text-xs mt-1">deduped by message + digest</div>
        </div>
        <div className="card p-5">
          <div className="text-xs tracking-widest text-navy-300">EMAIL ALERTS</div>
          <div className="mt-2 text-2xl font-bold text-white">{mailerConnected() ? "ON" : "OFF"}</div>
          <div className="muted text-xs mt-1">{mailerConnected() ? (process.env.ALERT_EMAIL ? "sending" : "ALERT_EMAIL unset") : "RESEND_API_KEY missing"}</div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold tracking-widest text-navy-300 mb-3">RECENT ERRORS</h2>
        {errors.length === 0 ? (
          <div className="muted text-sm">No errors captured yet — the instrumentation hook and client digest reporter are live.</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-navy-300 text-left">
              <th className="py-2">Message</th><th>Digest</th><th>Path</th><th>Src</th><th>Count</th><th>Last seen</th>
            </tr></thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-t border-navy-800/60">
                  <td className="py-2 pe-3 text-navy-100">{e.message}</td>
                  <td className="text-navy-300">{e.digest ?? "—"}</td>
                  <td className="text-navy-300">{e.path ?? "—"}</td>
                  <td className="text-navy-300">{e.source}</td>
                  <td className="text-navy-100">{e.occurrences}</td>
                  <td className="text-navy-300 whitespace-nowrap">{new Date(e.lastSeen).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold tracking-widest text-navy-300 mb-3">HEARTBEATS</h2>
        {beats.length === 0 ? (
          <div className="muted text-sm">No heartbeat rows yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-navy-300 text-left">
              <th className="py-2">At</th><th>DB</th><th>New errors</th><th>Alerted</th><th>Detail</th>
            </tr></thead>
            <tbody>
              {beats.map((b, i) => (
                <tr key={i} className="border-t border-navy-800/60">
                  <td className="py-2 text-navy-100 whitespace-nowrap">{new Date(b.checkedAt).toLocaleString()}</td>
                  <td className={b.dbUp ? "text-emerald-400" : "text-rose-400"}>{b.dbUp ? "up" : "down"}</td>
                  <td className="text-navy-100">{b.newErrors}</td>
                  <td className="text-navy-300">{b.alerted ? "yes" : "no"}</td>
                  <td className="text-navy-300">{b.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
