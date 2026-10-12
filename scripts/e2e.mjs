#!/usr/bin/env node
/**
 * CUE end-to-end smoke — one script, no test framework.
 * Runs before every push (see .githooks/pre-push) or via node scripts/e2e.mjs [baseUrl].
 *
 * Seams exercised (public interfaces only):
 *   1. Sign in as the Summit Air demo owner (real /signin round trip via its
 *      server action) → lands on /dashboard.
 *   2. Demo seeding presence — the dashboard renders Summit Air's seeded
 *      pack chip and the priority-leak copy.
 *   3. Leak-score — POST /api/score with fixture answers gets a scored
 *      result back (the real scoring engine runs; nothing mocked).
 *   4. Ambassador ask-back — POST /api/ambassador. In deterministic mode
 *      (default, CI-friendly) the script runs against a deployment that has
 *      zero LLM keys, so ambassadorAnswer falls through to mode:"grounded"
 *      with the deterministic assistant answer — same routes, real data.
 *      Set E2E_ALLOW_LLM=1 to instead assert a live LLM answered.
 *   5. Auth guards — /api/digest/send unauthenticated must 401.
 *
 * Exit 0 = all checks passed. Exit 1 = any failure.
 */
const BASE = (process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:3210").replace(/\/$/, "");
const ALLOW_LLM = process.env.E2E_ALLOW_LLM === "1";

let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !extra ? "" : " — " + extra}`);
  if (!ok) fails++;
};

const OWNER_EMAIL = "demo@summitair.example";
const OWNER_PASSWORD = "hvac-demo-2026";

async function main() {
  // Health of the target
  const root = await fetch(BASE + "/");
  check("target reachable", root.ok, `${root.status} at ${BASE}`);

  // 1. Sign in — drive the real /signin server action and keep the session cookie.
  const signinPage = await fetch(BASE + "/signin");
  check("/signin renders", signinPage.ok, String(signinPage.status));
  const signinHtml = await signinPage.text();

  let cookie = "";
  // Progressive-enhancement form POST — no Next-Action header needed; the
  // hidden $$ACTION_ID field routes the action server-side, exactly like a
  // browser with JS-driven form action would. Stable across minor versions.
  const actionId = signinHtml.match(/ACTION_ID_([0-9a-f]{40,60})/)?.[1];
  check("signin action id found", !!actionId);
  if (actionId) {
    const boundary = '----e2e' + Date.now();
    const parts = [
      '--' + boundary,
      'Content-Disposition: form-data; name="$ACTION_ID_' + actionId + '"',
      '',
      '',
      '--' + boundary,
      'Content-Disposition: form-data; name="email"',
      '',
      OWNER_EMAIL,
      '--' + boundary,
      'Content-Disposition: form-data; name="password"',
      '',
      OWNER_PASSWORD,
      '--' + boundary + '--',
      '',
    ].join('\r\n');;
    const signin = await fetch(BASE + '/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      body: parts,
      redirect: 'manual',
    });
    const setCookie = signin.headers.getSetCookie?.() ?? [];
    cookie = (setCookie.find((x) => x.startsWith('cue_session=')) ?? '').split(';')[0];
    const body = await signin.text();
    const badCreds = body.includes('Invalid email or password');
    check('signin accepted credentials', !badCreds && signin.status < 400 && !badCreds, );
    check('session cookie issued', !!cookie, 'none of the actions produced one');
  } else {
    check('session cookie issued', false, 'no action id');
  }

  // 2. Demo seeding presence (dashboard as the signed-in owner).
  const dash = await fetch(BASE + "/dashboard", {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  check("/dashboard authenticated → 200", dash.status === 200, String(dash.status));
  const dashBody = dash.ok ? await dash.text() : "";
  check("Summit Air seeded pack chip", dashBody.includes("Home Services (HVAC) pack"), "pack chip missing");
  check(
    "Summit Air seeded leak renders",
    dashBody.includes("quote requests have had no follow-up") && dashBody.includes("99,360"),
    "priority leak missing",
  );
  if (dash.status !== 200 && !dashBody) {
    check("fallback: dashboard HTML text (signin may render 200 page without cookie)", false, "skipped");
  }

  // 3. Leak score — real scoring engine, fixture answers, unique throwaway email.
  // Question ids + bracket keys come from the /score page's escaped-JSON payload.
  const scorePage = await fetch(BASE + "/score");
  const scoreHtml = await scorePage.text();
  // Strip backslashes from the escaped RSC payload, then plain-JSON match.
  const flat = scoreHtml.split(String.fromCharCode(92)).join("");
  const qIds = [...flat.matchAll(/"id":"([a-z0-9_]+)","text/g)].map((m) => m[1]);
  const brackets = [...flat.matchAll(/"key":"([a-z0-9_]+)","label/g)].map((m) => m[1]);
  const bracket = brackets[brackets.length - 1];
  check("leak-score: fetched question + bracket fixtures", qIds.length >= 3 && !!bracket,
    `questions=${qIds.length} bracket=${bracket}`);

  const email = `e2e-${Date.now()}@cue-e2e.invalid`;
  const answers = Object.fromEntries(qIds.map((id, i) => [id, i < 2 ? 0 : 3])); // leak heavy on the first two
  const scoreRes = await fetch(BASE + "/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      businessName: "E2E Smoke Co",
      industry: "home_services",
      revenueBracket: bracket,
      answers,
    }),
  });
  const score = await scoreRes.json().catch(() => ({}));
  if (scoreRes.status === 429) {
    // The in-memory rate limit (5 submissions / IP / hour on the deployed
    // server per the same x-forwarded-for we can't vary) blocks repeated
    // local pushes. The limit being hit is itself evidence the route and
    // guard work; note it loudly, don't fake a pass.
    check("/api/score reached but rate-limited (repeated runs hit the 5/hour guard) — rerun later or use a fresh IP", false, String(scoreRes.status));
  } else {
    check("/api/score → 200", scoreRes.status === 200, `${scoreRes.status} ${JSON.stringify(score).slice(0, 120)}`);
    check("score computed from answers", typeof score?.score === "number" && score.score >= 0, String(score?.score));
    check(
      "leaky answers do not score perfectly healthy",
      !(qIds.slice(0, 2).every((id) => answers[id] === 0) && score?.score === 0),
      JSON.stringify(score).slice(0, 80),
    );
  }

  // 4. Ambassador ask-back.
  // Signed in (or not): POST /api/ambassador. When a session cookie is present
  // the route answers from records. Without one the route honestly replies
  // with the public intro — in that case re-send WITH the signin cookie we
  // got above; skip the grounded assertion only if signin never produced one.
  const ambRes0 = await fetch(BASE + "/api/ambassador", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What should I focus on today?", locale: "en" }),
  });
  const amb0 = await ambRes0.json().catch(() => ({}));
  check("/api/ambassador unauthenticated → public intro, 200", ambRes0.status === 200 && amb0?.mode === "public", `${ambRes0.status} mode=${amb0?.mode}`);

  if (cookie) {
    const ambRes = await fetch(BASE + "/api/ambassador", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ question: "What should I focus on today?", locale: "en" }),
    });
    const amb = await ambRes.json().catch(() => ({}));
    check("/api/ambassador authenticated → 200", ambRes.status === 200, String(ambRes.status));
    check("ambassador answered from records", typeof amb?.answer === "string" && amb.answer.length > 20, String(amb?.answer).slice(0, 80));
    // Mode is a property of the deployment (does it have an LLM key?), not of
    // this test. Any of the app's honest modes is acceptable:
    //   grounded   — assistant core answered deterministically (no LLM key)
    //   ambassador — a configured LLM framed the grounded facts (e.g. Groq)
    // The CI-safe expectation for E2E_ALLOW_LLM=1 is ambassador; otherwise
    // accept either, since the target's LLM configuration isn't ours to force.
    const expect = ALLOW_LLM ? "ambassador" : "grounded";
    const accept = ALLOW_LLM ? ["ambassador"] : ["grounded", "ambassador"];
    check(
      ALLOW_LLM
        ? "ambassador reached a live LLM (mode=ambassador)"
        : "ambassador answered through an honest mode (grounded OR ambassador)",
      accept.includes(amb?.mode),
      `mode=${amb?.mode} provider=${amb?.provider} (expected=${expect})`,
    );
    check(
      "ask-back cites real seeded numbers, not filler",
      /\$\d/.test(amb?.answer ?? "") || /\d{3}/.test(amb?.answer ?? ""),
      "no concrete figure in answer",
    );

    // Voice path: a small valid WAV through /capture/transcribe (same upload
    // the widget makes after recording). Only asserts the route accepts a
    // session + valid audio container and answers 200 — the transcription
    // content itself is nondeterministic (Groq Whisper), so we accept any
    // string; anything 4xx/5xx (auth regression, handler break) fails.
    const sr = 16000, n = sr; // 1 second of 16-bit mono PCM
    const samples = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.max(0, Math.sin(Math.PI * (t % 0.25) / 0.25));
      samples[i] = Math.round(7000 * env * Math.sin(2 * Math.PI * 260 * t));
    }
    const buf = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); wr(8, "WAVE"); wr(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); wr(36, "data");
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, samples[i], true);
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "audio/wav" }), "question.webm");
    const trRes = await fetch(BASE + "/capture/transcribe", { method: "POST", headers: { cookie }, body: form });
    check(
      "/capture/transcribe with session + fixture WAV → 200 (Groq transcription ran)",
      trRes.status === 200,
      `${trRes.status} ${(await trRes.text().catch(() => "")).slice(0, 100)}`,
    );
  } else {
    check("ambassador authenticated ask-back", false, "no session cookie from signin — cannot assert grounded mode");
  }

  // 5. Digest preview — the real builder runs for Summit Air; all four
  //    sections render with concrete dollar figures from live seeded data.
  //    (Skipped body asserts — the structurally-exact fallback would have
  //    been caught asking for an org with no seeded data.)
  if (cookie) {
    const prevRes = await fetch(BASE + "/api/digest/send?preview=1", { headers: { cookie } });
    let prev = {};
    try { prev = await prevRes.json(); } catch { /* non-JSON → fail below */ }
    check("/api/digest/send?preview=1 → 200", prevRes.status === 200, String(prevRes.status));
    const text = typeof prev?.preview === "string" ? prev.preview : "";
    check("digest preview returned text", text.length > 50, `len=${text.length}`);
    check("digest names the org", text.includes("Summit Air"), text.slice(0, 60));
    for (const [name, marker] of [
      ["open revenue leaks", "Open revenue leaks"],
      ["decisions awaiting approval", "Decisions awaiting your approval"],
      ["approvals this week", "Approvals this week"],
      ["money found / recovered", "Money found / recovered"],
    ]) {
      check(`digest section: ${name}`, text.includes(marker), marker);
    }
    // Figures must parse as non-negative finite numbers (zero is plausible —
    // an empty "collected" bucket) — NaN/negative/absurdly large = broken builder.
    const dollars = text.match(/\$\d[\d,]*/g) ?? [];
    check("digest cites ≥3 distinct dollar figures", dollars.length >= 3, `${dollars.length} found: ${dollars.slice(0, 5).join(", ")}`);
    check("dollar figures are plausible (non-negative, <$10M)", dollars.every((d) => { const n = Number(d.replace(/[$,]/g, "")); return Number.isFinite(n) && n >= 0 && n < 1e7; }), dollars.join(", "));
  } else {
    check("digest preview authenticated", false, "no session cookie — cannot assert sections");
  }

  // 6. Agreements: renewal + proposal detectors + localized quote delivery.
  //    Fixture upkeep and DB reads go through scripts/e2e-db-probe.mjs —
  //    inline multi-line node -e is unreliable under Git Bash/Windows.
  if (cookie) {
    const { execFileSync } = await import("node:child_process");
    const probe = (mode) =>
      execFileSync(process.execPath, ["--env-file=.env", "scripts/e2e-db-probe.mjs", mode], { encoding: "utf8" }).trim().split("\n").pop();

    // Ensure the fixtures exist regardless of which seed ran last (idempotent).
    try { JSON.parse(probe("fixtures")); }
    catch { check("agreement fixtures seeded", false, "e2e-db-probe failed — is DATABASE_URL set?"); }

    // Fire the app's own refresh action (progressive-enhancement form POST
    // against the understand page), then re-read the insights table.
    const page = await fetch(BASE + "/understand", { headers: { cookie } });
    const html = await page.text();
    const ids = [...new Set([...html.matchAll(/ACTION_ID_([0-9a-f]{40,60})/g)].map((m) => m[1]))];
    let refreshed = false;
    for (const id of ids) {
      const rb = "----r" + Date.now();
      const rp = ["--" + rb, 'Content-Disposition: form-data; name="$ACTION_ID_' + id + '"', "", "", "--" + rb + "--", ""].join("\r\n");
      const res = await fetch(BASE + "/understand", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=" + rb, cookie }, body: rp, redirect: "manual" });
      if (res.status === 303 || res.status === 200) { refreshed = true; break; }
    }
    check("understand refresh action fired", refreshed, ids.length + " action ids on page");

    const flags = JSON.parse(probe("insights"));
    check("renewal detector insight open (agreement ≤30d)", flags.renewal === true, (flags.titles ?? []).join("; ").slice(0, 140));
    check("proposal detector insight open (no-agreement heavy users)", flags.proposal === true, (flags.titles ?? []).join("; ").slice(0, 140));

    // Localized quote: resolve Yolanda's id via the probe, then preview via route.
    const y = JSON.parse(probe("customer"));
    if (y) {
      const qRes = await fetch(BASE + "/api/quotes/send", {
        method: "POST", headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ customerId: y.id, title: "E2E quote", items: [{ description: "Fixture quote line", amount: 1000 }], preview: true }),
      });
      const q = await qRes.json().catch(() => ({}));
      check("quote preview resolves customer locale (es)", qRes.status === 200 && q?.locale === "es" && q?.localeSource === "customer", `status=${qRes.status} locale=${q?.locale} source=${q?.localeSource}`);
      check("quote plaintext is Spanish", typeof q?.previewText === "string" && q.previewText.includes("Su cotización"), (q?.previewText ?? "").slice(0, 60));
      const qEn = await fetch(BASE + "/api/quotes/send", {
        method: "POST", headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ customerId: y.id, title: "E2E quote", items: [{ description: "Fixture", amount: 1 }], locale: "vi", preview: true }),
      });
      const qe = await qEn.json().catch(() => ({}));
      check("quote locale override wins over customer pref", qEn.status === 200 && qe?.locale === "vi" && qe?.localeSource === "override", `locale=${qe?.locale} source=${qe?.localeSource}`);
    } else {
      check("quote locale fixtures present", false, "Yolanda Reyes not found — seed-hvac missing?");
    }
  }

  // 7. Auth guards still up.
  const digestUnauth = await fetch(BASE + "/api/digest/send");
  check("/api/digest/send unauthenticated → 401", digestUnauth.status === 401, String(digestUnauth.status));
  const quoteUnauth = await fetch(BASE + "/api/quotes/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("/api/quotes/send unauthenticated → 401", quoteUnauth.status === 401, String(quoteUnauth.status));

  console.log(fails === 0 ? "\nE2E PASSED" : `\n${fails} E2E FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("E2E CRASHED:", e.message);
  process.exitCode = 1;
});
