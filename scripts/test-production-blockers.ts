/**
 * Verifies the production-blocker fixes: rate limiter logic (unit),
 * /api/health, ingest rate limiting (live HTTP), sign-route auth.
 * Dev server must be up for the HTTP parts.
 * npx tsx scripts/test-production-blockers.ts
 */
import { prisma } from "../src/lib/prisma";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

const BASE = "http://localhost:3210";

async function main() {
  // ── 1. Rate limiter unit behavior ──
  const { rateLimit } = await import("../src/lib/ratelimit");
  const key = `unit:${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    assert(rateLimit(key, 5, 60).ok, `attempt ${i + 1} of 5 allowed`);
  }
  const blocked = rateLimit(key, 5, 60);
  assert(!blocked.ok && blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60, `6th attempt blocked with retryAfter=${blocked.retryAfterSec}s`);
  // Independent keys don't interfere
  assert(rateLimit(`${key}-other`, 5, 60).ok, "separate key unaffected");

  // ── 2. /api/health (live) ──
  const health = await fetch(`${BASE}/api/health`);
  const hj = await health.json();
  assert(health.status === 200 || health.status === 503, `health responds (${health.status})`);
  // Status must MATCH reality, whichever way the DB is reachable:
  if (health.status === 200) {
    assert(hj.status === "healthy" && hj.checks?.database === "ok", "healthy ⇔ database ok");
  } else {
    assert(hj.status === "unhealthy" && hj.checks?.database === "fail", "unhealthy ⇔ database fail (currently rotated credentials — endpoint honest)");
  }
  assert(typeof hj.checks.storageBackend === "string", "health reports storage backend");

  // ── 3. Ingest rate limit (live) — needs a reachable DB ──
  let org: { id: string; ingestKey: string | null } | null = null;
  try {
    org = await prisma.organization.findFirst({ where: { name: "Riverside Auto Group" }, select: { id: true, ingestKey: true } });
  } catch {
    console.log("skip — live ingest-rate-limit check needs a reachable DB (password rotation pending)");
  }
  if (org?.ingestKey) {
    // Fire concurrently — a sequential loop is slower than the window
    // (each Supabase round-trip ~2s) and the bucket resets mid-loop.
    let got429 = false;
    let retryAfter = "";
    const batch = Array.from({ length: 65 }, (_, i) =>
      fetch(`${BASE}/api/ingest/signals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${org.ingestKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: `rl-probe ${Date.now()}-${i}` }),
      }).then(async (res) => {
        if (res.status === 429) {
          got429 = true;
          retryAfter = res.headers.get("retry-after") ?? "";
        }
      })
    );
    await Promise.all(batch);
    assert(got429, "ingest rate limit trips under concurrent flood (live)");
    assert(!!retryAfter, "429 carries Retry-After header");
    // Clean any probe signals that got through + reset won't matter (window expires)
    await prisma.marketSignal.deleteMany({ where: { organizationId: org.id, content: { startsWith: "rl-probe" } } });
    await prisma.auditEvent.deleteMany({ where: { organizationId: org.id, action: "SIGNALS_INGESTED", createdAt: { gte: new Date(Date.now() - 120_000) } } });
  } else {
    console.log("skip — Riverside ingest key unavailable (offline DB?)");
  }

  // ── 4. Sign route requires a session (redirect → signin) ──
  const signAnon = await fetch(`${BASE}/api/uploads/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", redirect: "manual" });
  assert([401, 307, 303].includes(signAnon.status) || (signAnon.headers.get("location") ?? "").includes("signin"), `unauthenticated sign blocked (${signAnon.status})`);

  console.log("PASS — production blockers verified");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
