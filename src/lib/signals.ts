import { createHash } from "crypto";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { autoAssignLead } from "./crm";

// ─────────────────────────────────────────────────────────────
// Market Signals — inbound monitoring of what people say online
// about buying, selling, or servicing (cars or anything else).
// Signals arrive through /api/ingest/* from social-listening
// tools (webhooks/RSS) or Google Business Profile, are deduped
// by content fingerprint, and can be converted into real leads
// or opportunities. Nothing is invented: only what arrived.
// ─────────────────────────────────────────────────────────────

export type SignalIntent = "BUY" | "SELL" | "SERVICE" | "OTHER";

const BUY_WORDS = [
  "looking to buy", "want to buy", "in the market for", "shopping for",
  "need a new", "need a used", "where to buy", "recommend a dealer",
  "best price on", "looking for a", "buy a car", "buy a truck", "buy an",
];
const SELL_WORDS = [
  "sell my", "sell our", "selling my", "selling our", "who buys",
  "cash for cars", "cash for my", "trade in my", "trade-in my",
  "part with my", "get rid of my",
];
const SERVICE_WORDS = [
  "oil change", "check engine", "brakes", "brake job", "tires", "alignment",
  "repair", "mechanic", "dealership service", "service appointment",
  "scheduled maintenance", "transmission", "battery replacement", "recall",
];

export function classifyIntent(text: string): SignalIntent {
  const t = text.toLowerCase();
  if (BUY_WORDS.some((k) => t.includes(k))) return "BUY";
  if (SELL_WORDS.some((k) => t.includes(k))) return "SELL";
  if (SERVICE_WORDS.some((k) => t.includes(k))) return "SERVICE";
  return "OTHER";
}

/** Content-addressed fingerprint so replayed alerts never double-count,
 *  even when the provider drops or renames its external id between deliveries. */
function fingerprint(orgId: string, text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  return `txt:${createHash("sha256").update(`${orgId}|${norm}`).digest("hex")}`;
}

/** Keywords from the org's active watches that appear in the text (loose matching). */
async function matchWatches(orgId: string, text: string) {
  const watches = await prisma.marketWatch.findMany({ where: { organizationId: orgId, active: true } });
  const t = text.toLowerCase();
  let matchedWatch: { id: string; name: string } | null = null;
  const keywords: string[] = [];
  for (const w of watches) {
    const kws = w.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hit = kws.filter((k) => t.includes(k));
    if (hit.length > 0 && (!matchedWatch || hit.length > keywords.length)) {
      matchedWatch = { id: w.id, name: w.name };
      keywords.length = 0;
      keywords.push(...hit);
    }
  }
  return { watchId: matchedWatch?.id ?? null, watchName: matchedWatch?.name ?? null, keywords };
}

export type IngestItem = {
  source?: string; // WEBHOOK | RSS (default WEBHOOK)
  externalId?: string | null;
  externalUrl?: string | null;
  author?: string | null;
  title?: string | null;
  content: string;
  publishedAt?: string | Date | null;
  watchKeywords?: string[] | null; // provider-supplied matched keywords
};

export async function ingestSignals(orgId: string, items: IngestItem[]) {
  let created = 0;
  let duplicates = 0;
  const signals: { id: string; title: string }[] = [];

  for (const item of items) {
    const text = [item.title ?? "", item.content ?? ""].join(" ").trim();
    if (!text) continue;

    const watch = await matchWatches(orgId, text);
    const matchedKeywords = item.watchKeywords?.length
      ? item.watchKeywords.join(", ")
      : watch.keywords.join(", ");
    const source = item.source === "RSS" ? "RSS" : "WEBHOOK";
    // Fingerprint on the body text only — titles are provider-styled and vary.
    const fp = fingerprint(orgId, item.content);
    // Duplicate = same content hash OR the same provider external id
    // (covers re-delivery with edited text).
    const existing = await prisma.marketSignal.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { fingerprint: fp },
          ...(item.externalId ? [{ externalId: item.externalId }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) { duplicates++; continue; }

    let receivedAt = new Date();
    if (item.publishedAt) {
      const d = new Date(item.publishedAt);
      if (!Number.isNaN(d.getTime())) receivedAt = d;
    }

    const signal = await prisma.marketSignal.create({
      data: {
        organizationId: orgId,
        watchId: watch.watchId,
        source,
        externalId: item.externalId ?? null,
        externalUrl: item.externalUrl ?? null,
        author: item.author ?? null,
        title: (item.title ?? text).slice(0, 160),
        content: item.content.slice(0, 4000),
        intent: classifyIntent(text),
        matchedKeywords: matchedKeywords || null,
        fingerprint: fp,
        receivedAt,
      },
    });
    if (watch.watchId) {
      await prisma.marketWatch.update({ where: { id: watch.watchId }, data: { lastSignalAt: new Date() } });
    }
    signals.push({ id: signal.id, title: signal.title });
    created++;
  }

  if (items.length > 0) {
    await logAudit({
      organizationId: orgId,
      actorType: "SYSTEM",
      action: "SIGNALS_INGESTED",
      targetType: "MarketSignal",
      detail: `${created} new market signal(s) ingested, ${duplicates} duplicate(s) skipped`,
      metadata: { received: items.length, created, duplicates },
    });
  }
  return { created, duplicates, signals };
}

/** Turn a reviewed signal into a real lead (used-car style pipeline). */
export async function convertSignalToLead(orgId: string, signalId: string, actorId?: string) {
  const signal = await prisma.marketSignal.findFirst({
    where: { id: signalId, organizationId: orgId },
    include: { watch: true },
  });
  if (!signal) throw new Error("Signal not found");
  if (signal.convertedLeadId) {
    const lead = await prisma.lead.findUnique({ where: { id: signal.convertedLeadId } });
    return { leadId: signal.convertedLeadId, leadName: lead?.name ?? "Existing lead", already: true };
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: orgId,
      name: signal.author?.trim() || "Market signal contact",
      source: signal.source.startsWith("GBP") ? "GBP" : "MARKET",
      interest: `Market: ${signal.watch?.name ?? signal.matchedKeywords ?? signal.source}`.slice(0, 80),
      estValue: null, // honest: unverified market chatter has no value estimate yet
      status: "NEW",
    },
  });
  await prisma.marketSignal.update({
    where: { id: signal.id },
    data: { status: "CONVERTED_LEAD", convertedLeadId: lead.id },
  });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "SIGNAL_CONVERTED_TO_LEAD",
    targetType: "Lead",
    targetId: lead.id,
    detail: `From market signal: "${signal.title.slice(0, 80)}"`,
    metadata: { signalId: signal.id },
  });
  // Start the 15-minute clock fairly: give it to the least-loaded salesperson.
  await autoAssignLead(orgId, lead.id, actorId);
  return { leadId: lead.id, leadName: lead.name, already: false };
}

/** Turn a signal into an OPPORTUNITY insight with evidence (visible on Understand). */
export async function convertSignalToInsight(orgId: string, signalId: string, actorId?: string) {
  const signal = await prisma.marketSignal.findFirst({
    where: { id: signalId, organizationId: orgId },
    include: { watch: true },
  });
  if (!signal) throw new Error("Signal not found");
  if (signal.convertedInsightId) return { insightId: signal.convertedInsightId, already: true };

  const insight = await prisma.insight.create({
    data: {
      organizationId: orgId,
      type: "OPPORTUNITY",
      title: `Market signal: ${signal.title.slice(0, 120)}`,
      summary: signal.content.slice(0, 600),
      severity: "LOW",
      evidence: JSON.stringify([{
        kind: "MarketSignal",
        id: signal.id,
        label: signal.title,
        detail: `${signal.source}${signal.externalUrl ? ` · ${signal.externalUrl}` : ""}${signal.author ? ` · by ${signal.author}` : ""}`,
      }]),
      reasoning: `Converted from an inbound market signal received ${signal.receivedAt.toISOString().slice(0, 10)} via ${signal.source}${signal.watch ? ` (watch: ${signal.watch.name})` : ""}. Severity is LOW until a human verifies the mention and makes contact.`,
      confidence: 0.6,
    },
  });
  await prisma.marketSignal.update({
    where: { id: signal.id },
    data: { status: "CONVERTED_INSIGHT", convertedInsightId: insight.id },
  });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "SIGNAL_CONVERTED_TO_INSIGHT",
    targetType: "Insight",
    targetId: insight.id,
    detail: `From market signal: "${signal.title.slice(0, 80)}"`,
    metadata: { signalId: signal.id },
  });
  return { insightId: insight.id, already: false };
}

// ───────────────────────── Google Business Profile ─────────────────────────

export type GbpIngestItem = {
  externalId?: string | null;
  kind?: "REVIEW" | "MESSAGE";
  authorName: string;
  rating?: number | null;
  body: string;
  reviewerUrl?: string | null;
  postedAt?: string | Date | null;
};

function sentimentFor(rating: number | null): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  if (rating == null) return "NEUTRAL";
  if (rating >= 4) return "POSITIVE";
  if (rating === 3) return "NEUTRAL";
  return "NEGATIVE";
}

export async function ingestGbp(orgId: string, items: GbpIngestItem[]) {
  let created = 0;
  let duplicates = 0;

  for (const item of items) {
    const body = (item.body ?? "").trim();
    if (!body || !item.authorName?.trim()) continue;

    const kind = item.kind === "MESSAGE" ? "MESSAGE" : "REVIEW";
    const rating = kind === "REVIEW" && item.rating != null
      ? Math.min(5, Math.max(1, Math.round(item.rating)))
      : null;
    let postedAt = new Date();
    if (item.postedAt) {
      const d = new Date(item.postedAt);
      if (!Number.isNaN(d.getTime())) postedAt = d;
    }

    // Dedupe: externalId when provided, else content match.
    const existing = item.externalId
      ? await prisma.gbpReview.findFirst({ where: { organizationId: orgId, externalId: item.externalId } })
      : await prisma.gbpReview.findFirst({
          where: { organizationId: orgId, channel: kind, authorName: item.authorName.trim(), body: body.slice(0, 4000) },
        });
    if (existing) { duplicates++; continue; }

    const review = await prisma.gbpReview.create({
      data: {
        organizationId: orgId,
        externalId: item.externalId ?? null,
        channel: kind,
        authorName: item.authorName.trim().slice(0, 120),
        rating,
        sentiment: sentimentFor(rating),
        body: body.slice(0, 4000),
        reviewerUrl: item.reviewerUrl ?? null,
        postedAt,
      },
    });

    // Mirror into the unified signal inbox.
    await ingestSignals(orgId, [{
      source: "WEBHOOK",
      externalId: `gbp:${review.id}`,
      author: review.authorName,
      title: kind === "REVIEW"
        ? `${rating ?? ""}★ Google review from ${review.authorName}`.trim()
        : `Google message from ${review.authorName}`,
      content: review.body,
      publishedAt: postedAt,
    }]).then((r) => {
      if (r.signals[0]) {
        return prisma.marketSignal.update({
          where: { id: r.signals[0].id },
          data: { source: kind === "REVIEW" ? "GBP_REVIEW" : "GBP_MESSAGE", gbpReviewId: review.id },
        });
      }
    });

    created++;
  }

  if (items.length > 0) {
    await logAudit({
      organizationId: orgId,
      actorType: "SYSTEM",
      action: "GBP_INGESTED",
      targetType: "GbpReview",
      detail: `${created} Google review(s)/message(s) ingested, ${duplicates} duplicate(s) skipped`,
      metadata: { received: items.length, created, duplicates },
    });
  }
  return { created, duplicates };
}

/** Record a (manual or API-mirrored) response to a review or message. */
export async function respondToReview(orgId: string, reviewId: string, responseText: string, actorId?: string) {
  const review = await prisma.gbpReview.findFirst({ where: { id: reviewId, organizationId: orgId } });
  if (!review) throw new Error("Review not found");
  await prisma.gbpReview.update({
    where: { id: review.id },
    data: { status: "REPLIED", responseText: responseText.slice(0, 2000), respondedAt: new Date() },
  });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "GBP_REVIEW_RESPONDED",
    targetType: "GbpReview",
    targetId: review.id,
    detail: `${review.channel === "REVIEW" ? `${review.rating ?? ""}★ review`.trim() : "Message"} from ${review.authorName} — response recorded`,
  });
}

/** Mark a signal reviewed or dismissed (no conversion). */
export async function setSignalStatus(orgId: string, signalId: string, status: "REVIEWED" | "DISMISSED", actorId?: string) {
  const signal = await prisma.marketSignal.findFirst({ where: { id: signalId, organizationId: orgId } });
  if (!signal) throw new Error("Signal not found");
  await prisma.marketSignal.update({ where: { id: signal.id }, data: { status } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: status === "DISMISSED" ? "SIGNAL_DISMISSED" : "SIGNAL_REVIEWED",
    targetType: "MarketSignal",
    targetId: signal.id,
    detail: signal.title.slice(0, 100),
  });
}

// ───────────────────────── Watches (saved keyword searches) ─────────────────────────

export async function createWatch(
  orgId: string,
  data: { name: string; keywords: string; geography?: string | null; sourceHint?: string | null },
  actorId?: string
) {
  const watch = await prisma.marketWatch.create({
    data: {
      organizationId: orgId,
      name: data.name.trim().slice(0, 120),
      keywords: data.keywords.split(",").map((k) => k.trim()).filter(Boolean).join(","),
      geography: data.geography?.trim() || null,
      sourceHint: data.sourceHint?.trim() || null,
    },
  });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "WATCH_CREATED",
    targetType: "MarketWatch",
    targetId: watch.id,
    detail: `${watch.name} — keywords: ${watch.keywords}${watch.geography ? ` · ${watch.geography}` : ""}`,
  });
  return watch;
}

export async function setWatchActive(orgId: string, watchId: string, active: boolean, actorId?: string) {
  const watch = await prisma.marketWatch.findFirst({ where: { id: watchId, organizationId: orgId } });
  if (!watch) throw new Error("Watch not found");
  await prisma.marketWatch.update({ where: { id: watch.id }, data: { active } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "WATCH_UPDATED",
    targetType: "MarketWatch",
    targetId: watch.id,
    detail: `${watch.name} ${active ? "resumed" : "paused"}`,
  });
}

export async function deleteWatch(orgId: string, watchId: string, actorId?: string) {
  const watch = await prisma.marketWatch.findFirst({ where: { id: watchId, organizationId: orgId } });
  if (!watch) throw new Error("Watch not found");
  await prisma.marketSignal.updateMany({ where: { watchId: watch.id }, data: { watchId: null } });
  await prisma.marketWatch.delete({ where: { id: watch.id } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "WATCH_DELETED",
    targetType: "MarketWatch",
    targetId: watch.id,
    detail: watch.name,
  });
}
