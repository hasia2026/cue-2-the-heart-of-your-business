/**
 * HTTP smoke for the ingest endpoints against the live dev server,
 * using the Riverside demo org's real ingest key.
 * Dev server must be up: npx tsx scripts/smoke-signals-http.ts
 */
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:3210";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "Riverside Auto Group" } });
  if (!org?.ingestKey) throw new Error("Riverside org / ingest key missing — run prisma/seed-dealership.ts");
  const key = org.ingestKey;

  // Idempotent start: clear leftovers from earlier smoke runs
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id, OR: [{ author: "smoke_tester" }, { author: "Smoke Tester" }] } });
  await prisma.gbpReview.deleteMany({ where: { organizationId: org.id, externalId: "g-smoke-1" } });

  const url = `${BASE}/api/ingest/signals`;
  const gurl = `${BASE}/api/ingest/google`;

  // Auth failures
  const noAuth = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert(noAuth.status === 401, "missing bearer key rejected (401)");
  const badAuth = await fetch(url, { method: "POST", headers: { Authorization: "Bearer nope", "Content-Type": "application/json" }, body: JSON.stringify({ content: "x" }) });
  assert(badAuth.status === 401, "invalid bearer key rejected (401)");

  // Loose social-listening payload (Brand24-ish shape: posts[].message)
  const payload = {
    posts: [{
      id: "http-smoke-1",
      username: "smoke_tester",
      message: "Looking to buy a truck near Riverside before my road trip — any honest dealers?",
      url: "https://example.com/smoke/1",
    }],
  };
  const r1 = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j1 = await r1.json();
  assert(r1.status === 200 && j1.created === 1, `loose webhook payload ingested (created=${j1.created})`);
  const r1b = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j1b = await r1b.json();
  assert(j1b.created === 0 && j1b.duplicates === 1, "HTTP replay deduped");

  // GBP message ingest — items under `messages` must classify as MESSAGE
  const g1 = await fetch(gurl, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ id: "g-smoke-1", authorName: "Smoke Tester", message: "Do you have hybrids in stock?" }] }) });
  const gj1 = await g1.json();
  assert(g1.status === 200 && gj1.created === 1, `GBP message ingested (created=${gj1.created})`);
  const gRow = await prisma.gbpReview.findFirst({ where: { organizationId: org.id, externalId: "g-smoke-1" } });
  assert(gRow?.channel === "MESSAGE" && gRow?.rating === null, "messages[] item stored as MESSAGE (not REVIEW)");
  const gMirror = await prisma.marketSignal.findFirst({ where: { organizationId: org.id, gbpReviewId: gRow?.id } });
  assert(gMirror?.source === "GBP_MESSAGE" && gMirror?.intent === "OTHER", "mirror tagged GBP_MESSAGE");

  // Signals page renders with the data
  const { createHmac } = await import("crypto");
  const user = await prisma.user.findUnique({ where: { email: "gm@riversideauto.demo" } });
  if (!user) throw new Error("demo user missing");
  const expires = Date.now() + 3_600_000;
  const cookie = `cue_session=${user.id}.${expires}.${createHmac("sha256", process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me").update(`${user.id}.${expires}`).digest("hex")}`;
  const page = await (await fetch(`${BASE}/signals`, { headers: { cookie } })).text();
  assert(page.includes("Market Signals"), "/signals renders with nav title");

  // Cleanup smoke artifacts
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id, OR: [{ externalId: "http-smoke-1" }, { externalId: "gbp:ext" }, { author: "smoke_tester" }] } });
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id, title: "Google message from Smoke Tester" } });
  await prisma.gbpReview.deleteMany({ where: { organizationId: org.id, externalId: "g-smoke-1" } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id, action: { in: ["SIGNALS_INGESTED", "GBP_INGESTED"] }, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  console.log("PASS — ingest endpoints live over HTTP, demo org clean");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
