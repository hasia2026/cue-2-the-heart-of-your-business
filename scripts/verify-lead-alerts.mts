// Lead-alert pipeline verification (run: npx tsx --env-file=.env scripts/verify-lead-alerts.mts)
// Exercises the retry queue with DETERMINISTIC failure (RESEND_API_KEY blanked
// for the negative passes — sendMail reports not-sent, drain records backoff),
// then restores the key and proves queue→inbox delivery. Cleans up its rows.
// Note: Resend accepts even invalid recipients at API level (fails async via
// webhooks), so "delivered" here = API-accepted, which is what the queue can
// honestly retry.
import { sql } from "@/lib/db";
import { enqueueFailedAlert, pilotInboxEmails } from "@/lib/leads";
import { drainLeadAlerts, buildLeadAlertSummary, renderLeadAlertSummary } from "@/lib/lead-queue";
import { pushPilotAlert, pushConfigured } from "@/lib/push";

let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed += 1;
}

const ownerInbox = pilotInboxEmails();
console.log("routing inbox:", ownerInbox.join(", "));
check("inbox configured", ownerInbox.length >= 1 && ownerInbox.includes("shannon102501@gmail.com"));

const realKey = process.env.RESEND_API_KEY ?? "";
console.log("mailer key present:", !!realKey);

// ── Negative path: mailer unavailable → drain must backoff, not deliver ──
process.env.RESEND_API_KEY = "";
const subject = "QUEUE-VERIFY — attempt tracking (delete me)";
const text = "Synthetic retry-queue row from scripts/verify-lead-alerts.mts";
const targets = ["queue-verify-run@example.com", ownerInbox[0]];

await enqueueFailedAlert(targets, subject, text, "seeded by verifier");
const [row] = await sql`select id::int as id from lead_alert_queue where payload->>'text' = ${text} order by id desc limit 1`;
check("failure enqueued", row != null);

const drain1 = await drainLeadAlerts();
const [after1] = await sql`select attempts, last_error, extract(epoch from (next_attempt_at - now()))::int as eta_secs from lead_alert_queue where id = ${row.id}`;
check("drain attempted the row without delivering", drain1.attempted >= 1 && drain1.delivered === 0, `attempted=${drain1.attempted} delivered=${drain1.delivered}`);
check("backoff recorded on failure", after1.attempts === 1 && !!after1.last_error && after1.eta_secs > 0 && after1.eta_secs <= 30 * 60, `attempts=${after1.attempts} eta≈${Math.round((after1.eta_secs ?? 0) / 60)}min err=${String(after1.last_error).slice(0, 60)}`);

// Force due again → second attempt increments.
await sql`update lead_alert_queue set next_attempt_at = now() - interval '1 second' where id = ${row.id}`;
const drain2 = await drainLeadAlerts();
const [after2] = await sql`select attempts from lead_alert_queue where id = ${row.id}`;
check("retry attempt increments", drain2.attempted >= 1 && after2.attempts === 2, `attempts=${after2.attempts}`);

// Park: reach the 8th attempt.
await sql`update lead_alert_queue set attempts = 7, next_attempt_at = now() - interval '1 second' where id = ${row.id}`;
const drain3 = await drainLeadAlerts();
const [after3] = await sql`select attempts, last_error, delivered_at from lead_alert_queue where id = ${row.id}`;
check("8th attempt parks the row (never delivered)", after3.attempts === 8 && String(after3.last_error).startsWith("abandoned") && after3.delivered_at == null, `attempts=${after3.attempts}`);

// Second parked-ish row pending so the summary has pending>0 while parked=0/1.
await sql`delete from lead_alert_queue where id = ${row.id}`;

// ── Happy path: key restored, valid recipient, due now → delivered ──
process.env.RESEND_API_KEY = realKey;
const subjectGood = "QUEUE-VERIFY happy path (safe to delete)";
await enqueueFailedAlert(ownerInbox, subjectGood, `Synthetic VALID row — if this email arrives, queue→inbox delivery works. (${targets.join(", ")})`, "seeded by verifier (valid runs)");
const [goodRow] = await sql`select id::int as id from lead_alert_queue where payload->>'text' like 'Synthetic VALID%' order by id desc limit 1`;
await sql`update lead_alert_queue set next_attempt_at = now() - interval '1 second' where id = ${goodRow.id}`;
const drainGood = await drainLeadAlerts();
const [afterGood] = await sql`select delivered_at, attempts, last_error from lead_alert_queue where id = ${goodRow.id}`;
check("valid row delivers via queue", drainGood.delivered >= 1 && afterGood.delivered_at != null && afterGood.last_error == null, `attempts=${afterGood.attempts}`);

// ── Push channel: honest degradation with zero registered devices ──
console.log("push configured:", pushConfigured());
const push = await pushPilotAlert("VERIFY whisper", "no-op message (zero devices)", "/pipeline/scan-leads");
check("push degrades honestly with zero devices", !push.ok && (push.detail ?? "").includes("no device subscriptions"), `sent=${push.sent} detail=${push.detail}`);

// ── Summary builds over the real columns and reports the leftover states ──
const summary = await buildLeadAlertSummary();
const summaryText = renderLeadAlertSummary(summary);
check("summary counts the delivered row", summary.delivered24h >= 1, `delivered24h=${summary.delivered24h}`);
check("summary renders a readout", summaryText.includes("CUE lead alerts") && summaryText.includes("Pilot requests"));
console.log("--- summary preview ---\n" + summaryText + "\n--- end preview ---");

// ── Cleanup: no verifier rows left behind ──
await sql`delete from lead_alert_queue where payload->>'text' like 'Synthetic %'`;
const [left] = await sql`select count(*)::int as n from lead_alert_queue`;
check("test rows cleaned up", Number(left.n) === 0, `left=${left.n}`);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failed ? 1 : 0);
