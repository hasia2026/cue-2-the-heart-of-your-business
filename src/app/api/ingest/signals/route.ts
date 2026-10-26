// Social-listening webhook ingest — providers POST market mentions here.
// Auth: SIGNALS_INGEST_TOKEN (header x-cue-signals; token callers must name
// their org, validated against the DB) or any valid CUE session (scoped to
// that session's org). Deduped per-org by market_signals.signal_hash.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";
import { ingestSignal, notifySignalAlert, parseSocialPayload, resolveIngestAuth, type SignalKind } from "@/lib/market-signals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  // 60 webhook calls/min/IP blunts a runaway provider without affecting
  // normal syncs (provider batches arrive as arrays, one call each).
  const rl = rateLimitResult(clientKey(req, "ingest-signals"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } });

  const auth = await resolveIngestAuth(req, await getSession().catch(() => null), body);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind: SignalKind = "SOCIAL";
  const items = parseSocialPayload(body);
  if (!items.length) return NextResponse.json({ error: "No usable signal — title/text required" }, { status: 400 });

  let created = 0;
  const hotAlerts: Parameters<typeof notifySignalAlert>[0][] = [];
  for (const it of items.slice(0, 50)) {
    const r = await ingestSignal({
      organizationId: auth.organizationId,
      kind,
      source: it.source,
      externalId: it.externalId,
      author: it.author,
      channel: it.channel,
      title: it.title,
      body: it.body,
      url: it.url,
      occurredAt: it.occurredAt,
    });
    if (r.created) created += 1;
    // Fresh actionable signals (keyword or AI) alert the owner inbox, like scan leads:
    // BUY = someone asking to buy; SERVICE from social listening = someone asking
    // for service now. (GBP 5-star "great service" reviews stay silent.)
    if (r.created && r.intent === "BUY") hotAlerts.push({ ...it, intent: "BUY" as const, kind });
    else if (r.created && r.intent === "SERVICE") hotAlerts.push({ ...it, intent: "SERVICE" as const, kind });
  }
  for (const s of hotAlerts) await notifySignalAlert(s);
  return NextResponse.json({ ok: true, accepted: items.slice(0, 50).length, created, hotAlerts: hotAlerts.length });
}
