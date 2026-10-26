// GBP sync ingest — a Google Business Profile provider POSTs reviews/activity
// here. Accepts a {reviews:[...]} array or a single review object (Google's
// reviewId/comment/reviewer/createTime conventions). Auth + dedupe identical
// to /api/ingest/signals; kind is always GBP so each review can later be
// converted into a GBP-sourced lead.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";
import { ingestSignal, notifyBuySignal, parseGooglePayload, resolveIngestAuth } from "@/lib/market-signals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const rl = rateLimitResult(clientKey(req, "ingest-google"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } });

  const auth = await resolveIngestAuth(req, await getSession().catch(() => null), body);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = parseGooglePayload(body);
  if (!items.length) return NextResponse.json({ error: "No usable review — reviewer/comment required" }, { status: 400 });

  let created = 0;
  const buyAlerts: Parameters<typeof notifyBuySignal>[0][] = [];
  for (const it of items.slice(0, 50)) {
    const r = await ingestSignal({
      organizationId: auth.organizationId,
      kind: "GBP",
      source: "GBP",
      externalId: it.externalId,
      author: it.author,
      channel: it.channel,
      title: it.title,
      body: it.body,
      url: it.url,
      occurredAt: it.occurredAt,
    });
    if (r.created) created += 1;
    // Fresh BUY-intent signals (keyword or AI) alert the owner inbox, like scan leads.
    if (r.created && r.intent === "BUY") buyAlerts.push({ ...it, kind: "GBP" as const });
  }
  for (const s of buyAlerts) await notifyBuySignal(s);
  return NextResponse.json({ ok: true, accepted: items.slice(0, 50).length, created, buyAlerts: buyAlerts.length });
}
