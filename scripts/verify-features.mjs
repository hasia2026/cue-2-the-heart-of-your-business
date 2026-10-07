#!/usr/bin/env node
// Feature verification for Academy assignments + Pricing approvals.
// Signs a demo session cookie, checks rendered pages in EN/ES/AR, and runs the
// exact SQL each new server action executes (transaction-rolled-back where the
// rows must not persist).
// Usage: node --env-file=.env scripts/verify-features.mjs [baseUrl]
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.argv[2] ?? "http://localhost:3210";
const SECRET = process.env.CUE_SESSION_SECRET;
if (!SECRET) { console.error("CUE_SESSION_SECRET missing"); process.exit(1); }

const EMAIL = "demo@northgate.example";

function makeToken(userId) {
  const exp = Date.now() + 864e5;
  const payload = `${userId}.${exp}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let fails = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " — " + extra}`);
  if (!ok) fails++;
}

try {
  const [u] = await sql`select id from users where email = ${EMAIL}`;
  if (!u) throw new Error("demo user missing — run seed first");
  const [m] = await sql`select organization_id from members where user_id = ${u.id}`;
  const orgId = m.organization_id;
  const session = makeToken(u.id);

  async function page(path, locale) {
    const cookie = locale ? `cue_session=${session}; cue_locale=${locale}` : `cue_session=${session}`;
    const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
    return { status: res.status, body: await res.text() };
  }

  // ── Academy: EN page renders the new assignment UI ──
  const en = await page("/expand");
  check("/expand → 200", en.status === 200, String(en.status));
  check("Academy EN: assign panel", en.body.includes("Assign a track") && en.body.includes("Team member"));
  check("Academy EN: team assignments table", en.body.includes("Team assignments"));

  // ── Academy: ES + AR translations of the new keys ──
  const es = await page("/expand", "es");
  check("Academy ES: assign panel", es.body.includes("Asignar una ruta") && es.body.includes("Asignaciones del equipo"));
  const ar = await page("/expand", "ar");
  check("Academy AR: assign panel", ar.body.includes("تعيين مسار") && ar.body.includes("تعيينات الفريق"));

  // ── Pricing Studio: send-for-approval button renders (EN) ──
  const enh = await page("/enhance");
  check("/enhance → 200", enh.status === 200, String(enh.status));
  check("Pricing EN: Send for approval", enh.body.includes("Send for approval"));

  // ── Academy SQL flow (rolled back — nothing persists) ──
  // The demo user legitimately has academy rows (demo data), so assert the tx
  // ADDS nothing (before == after) rather than requiring a zero count.
  const [pBefore] = await sql`select count(*)::int as n from academy_progress where user_id = ${u.id}`;
  const [aBefore] = await sql`select count(*)::int as n from academy_assignments where user_id = ${u.id}`;
  const track = "auto";
  await sql.begin(async (tx) => {
    // setLessonDone (mark done)
    await tx`insert into academy_progress (organization_id, user_id, track, lesson)
      values (${orgId}, ${u.id}, ${track}, 1) on conflict (organization_id, user_id, track, lesson) do nothing`;
    const [p1] = await tx`select count(*)::int as n from academy_progress where user_id = ${u.id} and track = ${track}`;
    check("academy_progress upsert", p1.n === 1, `count ${p1.n}`);
    // setLessonDone (mark not done)
    await tx`delete from academy_progress where organization_id = ${orgId} and user_id = ${u.id} and track = ${track} and lesson = 1`;
    const [p2] = await tx`select count(*)::int as n from academy_progress where user_id = ${u.id} and track = ${track}`;
    check("academy_progress toggle-off", p2.n === 0, `count ${p2.n}`);
    // assignTrack
    await tx`insert into academy_assignments (organization_id, user_id, track, assigned_by)
      values (${orgId}, ${u.id}, ${track}, ${u.id}) on conflict (organization_id, user_id, track) do nothing`;
    const [a1] = await tx`select count(*)::int as n from academy_assignments where user_id = ${u.id} and track = ${track}`;
    check("academy_assignments insert", a1.n === 1, `count ${a1.n}`);
    throw { rollback: true };
  }).catch((e) => { if (!e?.rollback) throw e; });
  const [pLeft] = await sql`select count(*)::int as n from academy_progress where user_id = ${u.id}`;
  const [aLeft] = await sql`select count(*)::int as n from academy_assignments where user_id = ${u.id}`;
  check(
    "academy rows rolled back",
    pLeft.n === pBefore.n && aLeft.n === aBefore.n,
    `progress ${pLeft.n}/${pBefore.n} assignments ${aLeft.n}/${aBefore.n}`,
  );

  // ── Pricing approval flow (real insert → rendered → cleaned up) ──
  const title = "Price approval: Price a vehicle — 2021 Honda Civic EX (STK-D01) → $21,450";
  const actionTxt = "Set the price to $21,450 (floor $19,200). Acquisition $18,200 + Recon $1,000; Days on lot 74; Market adjustment +3%";
  const why = "Base cost $19,200 • Target margin 30% • 74 days on lot — aging trim applied";
  const [rec] = await sql`
    insert into recommendations (organization_id, title, action, rationale, impact_value, status, confidence)
    values (${orgId}, ${title}, ${actionTxt}, ${why}, 2250, 'PENDING', 0.9) returning id`;
  const exec1 = await page("/execute");
  check("/execute → 200", exec1.status === 200, String(exec1.status));
  check("Execute EN: approvals section with pending price", exec1.body.includes("Approvals") && exec1.body.includes("Price approval:"));
  check("Execute EN: approve/reject buttons", exec1.body.includes("Approve") && exec1.body.includes("Reject"));
  // decideRec (approve)
  await sql`update recommendations set status = 'APPROVED', decided_at = now(), decided_by = ${u.id} where id = ${rec.id}`;
  const exec2 = await page("/execute");
  check("Execute EN: approved rec ready for workflow", exec2.body.includes("ready to become workflows") && exec2.body.includes("Price approval:"));
  const execAr = await page("/execute", "ar");
  check("Execute AR: approvals localized", execAr.body.includes("الموافقات"));
  // cleanup: remove the verification recommendation
  await sql`delete from recommendations where id = ${rec.id}`;
  const [recLeft] = await sql`select count(*)::int as n from recommendations where id = ${rec.id}`;
  check("verification recommendation removed", recLeft.n === 0);

  // ── Demo data still clean of test artifacts ──
  const [att] = await sql`select count(*)::int as n from training_attempts`;
  const [part] = await sql`select count(*)::int as n from partners`;
  check("no test training attempts", att.n === 0, `${att.n} remaining`);
  check("no test partners", part.n === 0, `${part.n} remaining`);

  console.log(fails === 0 ? "\nALL FEATURE CHECKS PASSED" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
} catch (e) {
  console.error("VERIFY FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
