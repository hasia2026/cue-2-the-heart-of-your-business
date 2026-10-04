/**
 * Verifies Market Signals + GBP ingestion end-to-end against a scratch org:
 * intent classification, fingerprint dedupe, GBP mirroring, conversions.
 * npx tsx scripts/test-signals.ts
 */
import { prisma } from "../src/lib/prisma";
import { classifyIntent, ingestSignals, ingestGbp, convertSignalToLead, convertSignalToInsight } from "../src/lib/signals";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  // ── 1. Intent classification ──
  assert(classifyIntent("Looking to buy a truck near Riverside") === "BUY", "BUY intent detected");
  assert(classifyIntent("Selling my 2020 Tacoma this month") === "SELL", "SELL intent detected");
  assert(classifyIntent("Check engine light — need a mechanic") === "SERVICE", "SERVICE intent detected");
  assert(classifyIntent("Beautiful weather today") === "OTHER", "no false intent on chatter");

  const org = await prisma.organization.create({ data: { name: "__test-signals", isDemo: true } });
  const watch = await prisma.marketWatch.create({
    data: { organizationId: org.id, name: "Truck buyers", keywords: "looking to buy a truck", geography: "Testville" },
  });

  // ── 2. Ingest + dedupe ──
  const item = {
    externalId: "ext-1",
    author: "Marcus_T",
    title: "Anyone selling a pickup?",
    content: "Looking to buy a truck in the next two weeks near Testville.",
    externalUrl: "https://example.com/post/1",
  };
  const first = await ingestSignals(org.id, [item]);
  assert(first.created === 1 && first.duplicates === 0, `first ingest creates 1 (got ${first.created}/${first.duplicates})`);
  const second = await ingestSignals(org.id, [item]);
  assert(second.created === 0 && second.duplicates === 1, `replay deduped (got ${second.created}/${second.duplicates})`);

  // Same content, no external id (provider dropped its id) — deduped via content hash
  const third = await ingestSignals(org.id, [{ content: "Looking to buy a truck in the next two weeks near Testville." }]);
  assert(third.duplicates === 1, "content-hash dedupe catches id-less replay");

  const sig = await prisma.marketSignal.findFirst({ where: { organizationId: org.id } });
  assert(sig?.intent === "BUY" && sig?.watchId === watch.id, "signal classified BUY and matched to watch");
  assert(sig?.matchedKeywords === "looking to buy a truck", "matched keyword recorded");
  const w = await prisma.marketWatch.findUnique({ where: { id: watch.id } });
  assert(w?.lastSignalAt != null, "watch lastSignalAt updated");

  // ── 3. GBP ingest + mirror + dedupe ──
  const gbp1 = await ingestGbp(org.id, [{ externalId: "g-1", authorName: "Devon P.", rating: 2, body: "Waited way past my appointment." }]);
  assert(gbp1.created === 1, "GBP review ingested");
  const review = await prisma.gbpReview.findFirst({ where: { organizationId: org.id } });
  assert(review?.sentiment === "NEGATIVE" && review?.rating === 2, "review rating + sentiment stored");
  const mirror = await prisma.marketSignal.findFirst({ where: { organizationId: org.id, gbpReviewId: review?.id } });
  assert(mirror?.source === "GBP_REVIEW", "review mirrored into signal inbox as GBP_REVIEW");
  const gbp2 = await ingestGbp(org.id, [{ externalId: "g-1", authorName: "Devon P.", rating: 2, body: "Waited way past my appointment." }]);
  assert(gbp2.duplicates === 1 && gbp2.created === 0, "GBP replay deduped");

  // ── 4. Conversions (idempotent) ──
  const c1 = await convertSignalToLead(org.id, sig!.id);
  assert(!c1.already && c1.leadId, "signal converted to lead");
  const lead = await prisma.lead.findUnique({ where: { id: c1.leadId } });
  assert(lead?.source === "MARKET" && lead?.name === "Marcus_T", "lead created with MARKET source and author name");
  const c1b = await convertSignalToLead(org.id, sig!.id);
  assert(c1b.already && c1b.leadId === c1.leadId, "lead conversion is idempotent");

  const c2 = await convertSignalToInsight(org.id, sig!.id);
  const insight = await prisma.insight.findUnique({ where: { id: c2.insightId } });
  assert(insight?.type === "OPPORTUNITY" && insight?.evidence.includes("MarketSignal"), "insight created with MarketSignal evidence");
  const c2b = await convertSignalToInsight(org.id, sig!.id);
  assert(c2b.already, "insight conversion is idempotent");

  const auditCount = await prisma.auditEvent.count({
    where: { organizationId: org.id, action: { in: ["SIGNALS_INGESTED", "GBP_INGESTED", "SIGNAL_CONVERTED_TO_LEAD", "SIGNAL_CONVERTED_TO_INSIGHT"] } },
  });
  assert(auditCount >= 4, `audit trail written (${auditCount} events)`);

  // Cleanup
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id } });
  await prisma.gbpReview.deleteMany({ where: { organizationId: org.id } });
  await prisma.marketWatch.deleteMany({ where: { organizationId: org.id } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  await prisma.insight.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — Market Signals + GBP ingest verified, scratch org removed");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
