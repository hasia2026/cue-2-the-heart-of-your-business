#!/usr/bin/env node
// End-to-end smoke test: provisions the pilot login, signs a session cookie,
// and verifies authenticated pages return 200 with real demo data.
// Usage: node --env-file=.env scripts/smoke-auth.mjs [baseUrl]
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
try {
  await sql`update users set password_hash = ${hashPassword(PASSWORD)} where email = ${EMAIL}`;
  const [u] = await sql`select id from users where email = ${EMAIL}`;
  if (!u) throw new Error("demo user missing — run seed first");
  const [m] = await sql`select organization_id from members where user_id = ${u.id}`;
  const cookie = `cue_session=${makeToken(u.id)}`;
  await sql.end();

  let fails = 0;
  async function check(path, expect) {
    const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
    const ok = res.status === expect;
    if (!ok) fails++;
    console.log(`${ok ? "✓" : "✗"} ${path} → ${res.status} (want ${expect})`);
    return res;
  }

  await check("/dashboard", 200);
  await check("/compass", 200);
  await check("/understand", 200);
  await check("/capture", 200);
  await check("/knowledge", 200);
  await check("/pipeline", 200);
  await check("/execute", 200);
  await check("/report", 200);
  await check("/people", 200);
  await check("/expand", 200);
  await check("/enhance", 200);
  await check("/lab", 200);
  await check("/ecosystem", 200);
  await check("/settings", 200);
  await check("/signals", 200);

  // dashboard must render real dealership content
  const dash = await (await check("/dashboard", 200)).text();
  const hasInsight = dash.includes("unbilled") || dash.includes("leads") || dash.includes("attention");
  console.log(`${hasInsight ? "✓" : "✗"} dashboard contains live intelligence content`);
  if (!hasInsight) fails++;

  // assistant API answers from records
  const ai = await fetch(BASE + "/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ question: "What's unbilled in service?" }),
  });
  const aiBody = await ai.json();
  const aiOk = ai.status === 200 && /\$[\d,]+/.test(aiBody.answer ?? "");
  console.log(`${aiOk ? "✓" : "✗"} assistant returns grounded numbers (${ai.status})`);
  if (!aiOk) { fails++; console.log("  answer:", (aiBody.answer ?? JSON.stringify(aiBody)).slice(0, 200)); }

  console.log(fails === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${fails} FAILURE(S)`);
  console.log(`Pilot login: ${EMAIL} / ${PASSWORD}`);
  process.exit(fails === 0 ? 0 : 1);
} catch (e) {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
}
