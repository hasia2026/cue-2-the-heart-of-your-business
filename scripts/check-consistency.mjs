#!/usr/bin/env node
// Consistency check: the leave-behind page's total must never disagree with
// what the app shows elsewhere ("$X at stake" on the dashboard). Fetches the
// rendered pages with a signed demo session and asserts:
//   1. leave-behind total  == dashboard "at stake"  (when leave-behind rows
//      cover the same insight set — otherwise explains the delta)
//   2. leave-behind total  == sum of its printed leak rows
//   3. every leave-behind dollar figure also appears in the dashboard HTML
// Usage: node --env-file=.env scripts/check-consistency.mjs [baseUrl]
import { createHmac, scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const BASE = process.argv[2] ?? "http://localhost:3210";
const SECRET = process.env.CUE_SESSION_SECRET;
if (!SECRET) { console.error("CUE_SESSION_SECRET missing"); process.exit(1); }

const EMAIL = "demo@northgate.example";
const PASSWORD = "northgate-demo-2026";

function hashPassword(p) {
  const salt = randomBytes(16).toString("hex");
  return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
function makeToken(userId) {
  const exp = Date.now() + 864e5;
  const payload = `${userId}.${exp}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql`update users set password_hash = ${hashPassword(PASSWORD)} where email = ${EMAIL}`;
const [u] = await sql`select id from users where email = ${EMAIL}`;
if (!u) throw new Error("demo user missing — run seed first");
const [m] = await sql`select organization_id from members where user_id = ${u.id}`;
await sql.end();

const cookie = `cue_session=${makeToken(u.id)}`;
const [lbRes, dashRes] = await Promise.all([
  fetch(`${BASE}/leave-behind`, { headers: { cookie }, redirect: "manual" }),
  fetch(`${BASE}/dashboard`, { headers: { cookie }, redirect: "manual" }),
]);
if (lbRes.status !== 200 || dashRes.status !== 200) {
  console.log(`✗ pages fetch: leave-behind=${lbRes.status} dashboard=${dashRes.status}`);
  process.exitCode = 1;
} else {
  const lb = await lbRes.text();
  const dash = await dashRes.text();

  const dashes = (s) => Number(s.replace(/[^0-9]/g, ""));
  // leave-behind big well is the first large $ figure after the header block
  const lbTotalMatch = lb.match(/lb-amount"[^>]*>(\$[\d,]+)/);
  const lbTotal = lbTotalMatch ? dashes(lbTotalMatch[1]) : null;

  // sum of the leave-behind's leak rows (lb-num cells)
  const lbNums = [...lb.matchAll(/lb-num"[^>]*>(\$[\d,]+)</g)].map((x) => dashes(x[1]));
  // rows are (count, value) pairs; values are the $ ones
  const lbRowValues = [...lb.matchAll(/lb-num"[^>]*>(\$[\d,]+)</g)]
    .map((x) => dashes(x[1]))
    .filter((n, i, arr) => arr.indexOf(n) !== -1 || true);
  const lbRowSum = lbNums.reduce((s, n) => s + n, 0);

  // dashboard "at stake" tile: find the element directly preceding literal "at stake"
  const atStakeIdx = dash.indexOf("at stake");
  let dashStake = null;
  if (atStakeIdx > -1) {
    const before = dash.slice(Math.max(0, atStakeIdx - 200), atStakeIdx);
    const dollars = [...before.matchAll(/\$([\d,]+)/g)];
    if (dollars.length) dashStake = dashes(dollars[dollars.length - 1][0]);
  }

  let fails = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) fails++;
  };

  console.log(`leave-behind total: $${lbTotal?.toLocaleString() ?? "—"}`);
  console.log(`dashboard at stake: $${dashStake?.toLocaleString() ?? "—"}`);
  console.log(`leave-behind row figures: ${lbNums.map((n) => `$${n.toLocaleString()}`).join(", ")}`);

  check("leave-behind total rendered", lbTotal != null && lbTotal > 0);
  check("leave-behind total == sum of its leak rows", lbTotal === lbRowSum,
    lbTotal === lbRowSum ? "" : `total ${lbTotal} vs rows ${lbRowSum}`);
  if (dashStake != null && lbTotal != null) {
    if (lbTotal === dashStake) {
      check("leave-behind total == dashboard 'at stake'", true);
    } else {
      // Explainable delta: leave-behind counts detector-backed unbilled/leads/
      // aging categories + restricted insight sub-classes, dashboard counts
      // ALL open insights. The page's own copy promises same-detector parity,
      // so a mismatch is a defect — but report how big and which side.
      check("leave-behind total == dashboard 'at stake'",
        lbTotal === dashStake,
        `MISMATCH: lb $${lbTotal.toLocaleString()} vs dash $${dashStake.toLocaleString()} (delta $${Math.abs(lbTotal - dashStake).toLocaleString()})`);
    }
    // Traceability: every dollar figure printed in the leak ROWS (org data)
    // must appear on the dashboard. Static copy on the page (the $10,000
    // guarantee, sample fine-print figures from other stores) is excluded —
    // those are not claims about this org's data.
    const rowFigures = lbNums.map((n) => n.toLocaleString("en-US"));
    const missing = rowFigures.filter((f) => !dash.includes(`$${f}`) && !(dashStake === dashes(f)));
    check("every leave-behind $ figure traceable in dashboard",
      missing.length === 0,
      missing.length ? `not found in dashboard: ${missing.join(", ")}` : "");
  } else {
    console.log("— dashboard 'at stake' figure not found; cross-page check skipped");
  }

  process.exitCode = fails > 0 ? 1 : 0;
  if (fails === 0) console.log("\nCONSISTENCY OK");
  else console.log(`\n${fails} CONSISTENCY FAILURE(S)`);
}
