// Generic webhook ingest — one per-org secret URL any platform can POST to
// (Zapier "Webhook" action, Make "Instant HTTP" module, n8n Webhook node, or a
// curl in a script). Auth: ?token= or x-cue-webhook header, resolved against
// the integrations row (key='webhook'), like ReferPro. No session needed —
// automation platforms can't sign in.
// Payload: flat {title, text, source, url, id, author, channel, timestamp} or a
// {signals:[…]} / {items:[…]} array — the same normalizer the signals ingest
// uses, so every platform speaks one shape. Signals land in Market Signals,
// AI/keyword-classified (BUY/SELL/SERVICE), per-org deduped; BUY/SERVICE ones
// hot-alert the owner like native signals. Real traffic honestly flips the
// integration badge to CONNECTED.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";
import { ingestSignal, parseSocialPayload, type RawSignalPayload } from "@/lib/market-signals";

export const runtime = "nodejs";

/** Shared token+org resolution for GET verification and POST ingest. */
async function resolveOrg(token: string | null): Promise<Array<{ id: string; name: string }>> {
  if (!token || token.length < 16) return [];
  const rows = (await sql`
    select o.id, o.name from integrations i join organizations o on o.id = i.organization_id
    where i.key = 'webhook' and i.webhook_secret = ${token}`) as unknown as Array<{ id: string; name: string }>;
  return rows;
}

export async function GET(req: NextRequest) {
  // URL-verification ping: a valid GET proves the endpoint + token to Zapier
  // / Make / n8n (or to anyone configuring it from the Ecosystem page).
  const token = req.headers.get("x-cue-webhook") ?? req.nextUrl.searchParams.get("token");
  const [org] = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, org: org.name, integration: "webhook" });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  // 60 calls/min/IP blunts a runaway Zap without affecting normal usage.
  const rl = rateLimitResult(clientKey(req, "ingest-webhook"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } });

  const token = req.headers.get("x-cue-webhook") ?? req.nextUrl.searchParams.get("token");
  const [org] = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items: RawSignalPayload[] = parseSocialPayload(body);
  if (!items.length) return NextResponse.json({ error: "No usable signal — title/text required" }, { status: 400 });

  let created = 0;
  for (const it of items.slice(0, 50)) {
    const r = await ingestSignal({ organizationId: org.id, kind: "SOCIAL", ...it });
    if (r.created) created += 1;
  }

  if (created > 0) {
    // Real traffic flips the integration to CONNECTED honestly.
    await sql`
      update integrations
      set status = ${"CONNECTED"}, last_sync_at = now()
      where organization_id = ${org.id} and key = ${"webhook"} and status <> ${"CONNECTED"}`;
  }

  return NextResponse.json({ ok: true, org: org.name, accepted: items.slice(0, 50).length, created });
}
