#!/usr/bin/env node
// Service-plan sign-up flow verification (spec §4) — real server actions, no mocks.
//
// Usage: node --env-file=.env scripts/verify-plan-signups.mjs [baseUrl]
//
// Drives the actual public interfaces:
//   1. Signs in as the Summit Air demo owner (real /signin server action).
//   2. Seeds a unique active plan + submits a sign-up through the REAL
//      progressive-enhancement form on /plans/<orgId> (redirect to ?done=1).
//   3. Confirms the DB row: PENDING, QUOTE attribution carried through,
//      customer-matching attempted, plan-name snapshot taken.
//   4. Trips the 5-per-10-min rate limiter on the 6th submission (err=rate).
//   5. Converts the pending sign-up via the REAL convertSignup server action
//      (Next-Action header, same way the browser wires form actions) and
//      proves the effects in the DB: customer created, ACTIVE agreement,
//      row CONVERTED, audit event written.
//   6. Re-converts and proves the honest failure redirect (?planErr=…).
//   7. Cleans up every row it created so the demo org exits as it entered.
//
// The rate limiter is header-keyed (see src/lib/rate-limit.ts), so each
// POST carries a synthetic x-forwarded-for — a fresh bucket for the happy
// path, one fixed bucket for the deliberate trip. Vercel overrides client
// x-forwarded-for in production, so prod limiting is unaffected.
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const BASE = (process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3210").replace(/\/$/, "");

let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !extra ? "" : " — " + extra}`);
  if (!ok) fails++;
};

const OWNER_EMAIL = "demo@summitair.example";
const OWNER_PASSWORD = "summit-demo-2026";
const runId = Date.now().toString(36);
const PLAN_NAME = `CUE Verify Plan ${runId}`;
const REF = `QR-VERIFY-${runId}`;
const CONTACT_EMAIL = `verify-${runId}@cue-verify.invalid`;

const probe = (mode, ...args) =>
  JSON.parse(
    execFileSync(process.execPath, ["--env-file=.env", "scripts/verify-plan-sql-probe.mjs", mode, ...args], {
      encoding: "utf8",
    }).trim().split("\n").pop(),
  );

async function main() {
  // ── 1. Sign in through the real /signin form action ──
  const signinHtml = await (await fetch(BASE + "/signin")).text();
  const signinAction = signinHtml.match(/ACTION_ID_([0-9a-f]{40,60})/)?.[1];
  let cookie = "";
  if (signinAction) {
    const b = "----vps" + runId;
    const parts = [
      "--" + b, 'Content-Disposition: form-data; name="$ACTION_ID_' + signinAction + '"', "", "",
      "--" + b, 'Content-Disposition: form-data; name="email"', "", OWNER_EMAIL,
      "--" + b, 'Content-Disposition: form-data; name="password"', "", OWNER_PASSWORD,
      "--" + b + "--", "",
    ].join("\r\n");
    const res = await fetch(BASE + "/signin", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + b },
      body: parts,
      redirect: "manual",
    });
    await res.text().catch(() => "");
    cookie = (res.headers.getSetCookie?.().find((x) => x.startsWith("cue_session=")) ?? "").split(";")[0];
  }
  check("owner signed in via /signin", !!cookie, "no cue_session cookie");
  const dash = await fetch(BASE + "/dashboard", { headers: { cookie } });
  check("/dashboard authenticated → 200", dash.status === 200, String(dash.status));

  // ── 2. Demo org + unique plan ──
  let org;
  try { org = probe("org-for-email", OWNER_EMAIL); } catch { org = null; }
  check("demo org resolved", !!org?.orgId, JSON.stringify(org).slice(0, 120));
  if (!org?.orgId || !cookie) return finish();

  const plan = probe("seed-plan", org.orgId, PLAN_NAME);
  check("unique verify plan seeded (active, $600/yr)", plan?.ok === true, JSON.stringify(plan).slice(0, 120));

  // ── 3. Public page renders the sign-up form ──
  const plansHtml = await (await fetch(BASE + `/plans/${org.orgId}`)).text();
  check("/plans/<orgId> → 200", plansHtml.includes(PLAN_NAME), "plan name missing from page");
  const signupAction = plansHtml.match(/\$ACTION_ID_([0-9a-f]{40,60})/)?.[1];
  check("planSignup server action id rendered (no-JS form works)", !!signupAction);
  if (!signupAction) return finish();

  const submit = async (ip, overrides = {}) => {
    const fields = {
      orgId: org.orgId, planId: plan.planId,
      name: "Verify Requester", email: CONTACT_EMAIL, phone: "+1 555 010 0199",
      address: "100 Verify Ln", message: "E2E verification request",
      src: "quote", srcRef: REF, ...overrides,
    };
    const b = "----vps2" + runId + Math.random().toString(36).slice(2);
    const parts = [
      "--" + b, 'Content-Disposition: form-data; name="$ACTION_ID_' + signupAction + '"', "", "",
      ...Object.entries(fields).flatMap(([k, v]) =>
        ["--" + b, `Content-Disposition: form-data; name="${k}"`, "", String(v)]),
      "--" + b + "--", "",
    ].join("\r\n");
    const res = await fetch(BASE + `/plans/${org.orgId}`, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + b, "x-forwarded-for": ip, cookie },
      body: parts,
      redirect: "manual",
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, location: res.headers.get("location") ?? "", text };
  };

  // ── 4. Happy path → redirect ?done=1 ──
  const happyIp = `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`;
  const first = await submit(happyIp);
  check("sign-up redirect → /plans?done=1", first.status === 303 && first.location.includes("done=1"),
    `${first.status} ${first.location}`);

  // ── 5. DB row: PENDING + attribution + snapshot ──
  const row = probe("signup-row", org.orgId, REF);
  check("plan_signups row created", row?.found === true, JSON.stringify(row).slice(0, 160));
  check("row status PENDING, not decided", row?.status === "PENDING", String(row?.status));
  check("quote attribution carried (source=QUOTE, ref)", row?.source === "QUOTE" && row?.sourceRef === REF,
    `source=${row?.source} ref=${row?.sourceRef}`);
  check("plan name snapshot taken", row?.planName === PLAN_NAME, String(row?.planName));
  check("contact stored + no false customer match", row?.contactEmail === CONTACT_EMAIL && row?.customerMatched === false,
    `email=${row?.contactEmail} matched=${row?.customerMatched}`);

  // ── 6. Rate limiter: 5/10min per IP → 6th trips ──
  // Run-unique fixed bucket — parseInt(base36) not string-mod (NaN → shared bucket).
  const fixedIp = `10.99.${((parseInt(runId.slice(-6), 36) || 0) % 250) + 1}.${((parseInt(runId.slice(0, 6), 36) || 0) % 250) + 1}`;
  const posts = [];
  for (let i = 0; i < 6; i++) posts.push(await submit(fixedIp, { email: `burst-${runId}-${i}@cue-verify.invalid` }));
  const trippedAt = posts.findIndex((p) => p.location.includes("err=rate"));
  check("rate limiter trips (5 ok, 6th → ?err=rate)",
    posts.slice(0, 5).every((p) => p.location.includes("done=1")) && trippedAt === 5,
    trippedAt === -1 ? "never tripped" : `tripped at #${trippedAt + 1}`);
  const limited = await fetch(BASE + `/plans/${org.orgId}?err=rate`);
  const limitedText = await limited.text();
  check("err=rate renders honest slow-down message",
    limited.status === 200 && limitedText.includes("too many attempts"),
    `${limited.status} — copy missing from page`);

  // ── 7. Conversion: real convertSignup server action → real effects ──
  const signupId = row?.signupId;
  const enhancePage = await fetch(BASE + "/enhance", { headers: { cookie } });
  check("/enhance renders Plan Sign-Ups for owner", enhancePage.status === 200, String(enhancePage.status));
  const enhanceHtml = await enhancePage.text();
  check("inbox lists the pending request", enhanceHtml.includes(PLAN_NAME), "plan name missing");
  check("owner sees the Create agreement button", enhanceHtml.includes("Create agreement"), "button missing");

  const conv = await callVoidAction(enhanceHtml, "Create agreement", { signupId }, cookie);
  console.log(conv.text.slice(0, 600)); // diagnostics: the action's error flight
  check("convertSignup action accepted (200/303)", conv.status === 200 || (conv.status === 303 && !conv.location.includes("planErr")),
    `${conv.status} ${conv.text.slice(0, 120)}`);

  const converted = probe("signup-row-by-id", org.orgId, signupId);
  check("row now CONVERTED with customer linked", converted?.status === "CONVERTED" && converted?.customerMatched === true,
    JSON.stringify(converted).slice(0, 160));
  check("audit event PLAN_SIGNUP_CONVERTED written", converted?.auditConverted === true, JSON.stringify(converted).slice(0, 160));
  check("customer created with sign-up contact email", converted?.customerEmail === CONTACT_EMAIL, String(converted?.customerEmail));
  check("ACTIVE agreement created, notes cite the sign-up source",
    converted?.agreementStatus === "ACTIVE" && String(converted?.agreementNotes ?? "").includes(REF),
    `status=${converted?.agreementStatus} notes=${String(converted?.agreementNotes ?? "").slice(0, 80)}`);

  // ── 8. Double-convert → honest failure redirect ──
  const again = await callVoidAction(enhanceHtml, "Create agreement", { signupId }, cookie);
  const errRedirected = (again.status === 303 && again.location.includes("planErr")) ||
    (again.status === 200 && again.text.includes("already decided"));
  check("second convert redirects with the honest error", errRedirected,
    `${again.status} ${again.location} ${again.text.slice(0, 100)}`);

  finish();

  function finish() {
    // ── 9. Cleanup: the demo org must exit as it entered ──
    const clean = probe("cleanup", org?.orgId, REF, PLAN_NAME, CONTACT_EMAIL, signupId);
    check(
      "cleanup: signup + convert-created customer/agreement/plan removed",
      clean?.ok === true,
      `remaining signups=${clean?.remainingSignups} agreements=${clean?.remainingAgreements} customers=${clean?.remainingCustomers} plans=${clean?.remainingPlans}`,
    );
    console.log(fails === 0 ? "\nPLAN-SIGNUPS VERIFICATION PASSED" : `\n${fails} FAILURE(S)`);
    process.exitCode = fails === 0 ? 0 : 1;
  }
}

/** Calls the server action wired to the rendered no-JS form by taking its
 *  hidden $ACTION_ID straight from the SSR'd HTML of that exact form (the
 *  form is identified by its button label), then POSTs the form the way a
 *  no-JS browser does: plain multipart, the $ACTION_ID field routes it.
 *  Nothing is spoofed: id and button both come from the real page. */
async function callVoidAction(pageHtml, buttonLabel, fields, cookie) {
  const idx = pageHtml.indexOf(`>${buttonLabel}</button>`);
  if (idx === -1) {
    check(`form with "${buttonLabel}" found on page`, false, "button text missing");
    return { status: 0, location: "", text: "button not found" };
  }
  const formStart = pageHtml.lastIndexOf("<form ", idx);
  const id = pageHtml.slice(formStart, idx)?.match(/\$ACTION_ID_([0-9a-f]{40,60})/)?.[1];
  check(`"${buttonLabel}" form carries its server action id`, !!id);
  if (!id) return { status: 0, location: "", text: "action id not found" };

  const b = "----vact" + Math.random().toString(36).slice(2);
  const parts = [
    "--" + b, `Content-Disposition: form-data; name="$ACTION_ID_${id}"`, "", "",
    ...Object.entries(fields).flatMap(([k, v]) =>
      ["--" + b, `Content-Disposition: form-data; name="${k}"`, "", String(v)]),
    "--" + b + "--", "",
  ].join("\r\n");
  const res = await fetch(BASE + "/enhance", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=" + b, cookie },
    body: parts,
    redirect: "manual",
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, location: res.headers.get("location") ?? "", text };
}

main().catch((e) => {
  console.error("PLAN-SIGNUPS VERIFICATION CRASHED:", e.message);
  process.exitCode = 1;
});
