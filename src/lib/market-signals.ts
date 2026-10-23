// Market-signals ingest — shared logic for the two webhook endpoints
// (/api/ingest/signals for social listening providers, /api/ingest/google for
// GBP sync). Storage is the market_signals table; dedupe is a per-org unique
// index on signal_hash, so provider retries and replays are no-ops.
import { createHash } from "node:crypto";
import { sql } from "./db";
import { getSession, type Session } from "./auth";

export type SignalKind = "SOCIAL" | "GBP";
export type SignalIntent = "BUY" | "SELL" | "SERVICE";

const SellWords = /\b(sell(ing)?|for sale|trade[\s-]?in (my|this)|value of my|what.{0,6}s? (my|this).{0,20}(worth|value))\b/i;
const BuyWords = /\b(looking for|in the market|shopping (for|around)|want to buy|buy(ing)?|purchase|financing|trade.?in|recommend.{0,20}(me|a)|best place (to|for)|who (does|sells)|price on)\b/i;
const ServiceWords = /\b(service|repair|maintenance|checkup|inspection|tune.?up|appointment|book(ing)?|schedule|quote|estimate|leak|nois|brake|tire|ac not|cooling|heat(ing)?|oil)\b/i;

/** Keyword intent classifier — BUY / SELL / SERVICE; null when nothing matches. */
export function classifyIntent(text: string): SignalIntent | null {
  if (SellWords.test(text)) return "SELL";
  if (BuyWords.test(text)) return "BUY";
  if (ServiceWords.test(text)) return "SERVICE";
  return null;
}

export type SignalInput = {
  organizationId: string;
  kind: SignalKind;
  source: string;
  externalId: string | null;
  author: string | null;
  channel: string | null;
  title: string;
  body: string | null;
  url: string | null;
  occurredAt: Date | null;
};

/**
 * Per-org unique hash: provider external id when present, else a sha256 over
 * the normalized identity fields. Unique index enforces dedupe at the DB.
 */
export function signalHash(orgId: string, s: Pick<SignalInput, "kind" | "source" | "externalId" | "author" | "title" | "body">): string {
  if (s.externalId) return createHash("sha256").update(`${s.kind}:ext:${s.externalId}`).digest("hex");
  const norm = (v: string | null) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const payload = [orgId, s.kind, s.source, norm(s.author), norm(s.title), norm(s.body).slice(0, 500)].join("¦");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Insert one signal; a replay of the same signal (same per-org hash) is a
 * no-op. Returns whether a new row was created plus its id when so.
 */
export async function ingestSignal(s: SignalInput): Promise<{ created: boolean; id: string | null }> {
  const hash = signalHash(s.organizationId, s);
  const intent = classifyIntent(`${s.title} ${s.body ?? ""}`);
  const [row] = await sql`
    insert into market_signals
      (organization_id, kind, source, external_id, author, channel, title, body, url, intent, signal_hash, occurred_at)
    values
      (${s.organizationId}, ${s.kind}, ${s.source}, ${s.externalId}, ${s.author}, ${s.channel},
       ${s.title}, ${s.body}, ${s.url}, ${intent}, ${hash}, ${s.occurredAt})
    on conflict (organization_id, signal_hash) do nothing
    returning id`;
  return { created: !!row, id: row?.id ?? null };
}

/**
 * Webhook auth: SIGNALS_INGEST_TOKEN (header x-cue-signals) or any valid CUE
 * session. Token-authed callers must name their org (validated against the
 * organizations table); session-authed callers are scoped to their own org.
 * Returns null on an unauthorized request.
 */
export async function resolveIngestAuth(req: Request, cookieSession: Session | null, body: Record<string, unknown>): Promise<{ organizationId: string } | null> {
  const expected = process.env.SIGNALS_INGEST_TOKEN;
  const provided = req.headers.get("x-cue-signals");
  if (expected && provided && provided === expected) {
    const oid = typeof body?.organizationId === "string" && /^[0-9a-f-]{36}$/i.test(body.organizationId) ? body.organizationId : null;
    if (!oid) return null;
    const [org] = await sql`select id from organizations where id = ${oid}`;
    return org ? { organizationId: org.id } : null;
  }
  try {
    const session = cookieSession ?? (await getSession());
    return session ? { organizationId: session.organizationId } : null;
  } catch {
    return null;
  }
}

export type RawSignalPayload = {
  title: string;
  author: string | null;
  channel: string | null;
  source: string;
  externalId: string | null;
  body: string | null;
  url: string | null;
  occurredAt: Date | null;
};

/** Normalize an arbitrary provider webhook body into one or more raw signals. */
export function parseSocialPayload(b: Record<string, unknown>): RawSignalPayload[] {
  // Providers differ: accept a flat signal, a {signals:[...] array, or an
  // {items:[...]} array (listening-tool conventions).
  const items = Array.isArray(b?.signals) ? b.signals : Array.isArray(b?.items) ? b.items : [b];
  const out: RawSignalPayload[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    const o = raw ?? {};
    const title = typeof o.title === "string" && o.title.trim()
      ? o.title.trim().slice(0, 300)
      : (typeof o.text === "string" && o.text.trim() ? o.text.trim().slice(0, 300) : (typeof o.content === "string" ? o.content.trim().slice(0, 300) : ""));
    if (!title) continue; // one title-less item never kills the batch
    const occurredRaw = o.timestamp ?? o.created_at ?? o.createdAt ?? o.time;
    const ts = typeof occurredRaw === "number" ? new Date(occurredRaw < 1e12 ? occurredRaw * 1000 : occurredRaw) : typeof occurredRaw === "string" ? new Date(occurredRaw) : null;
    const occurredAt = ts && !Number.isNaN(ts.getTime()) ? ts : null;
    out.push({
      title,
      author: typeof o.author === "string" ? o.author.slice(0, 120) : typeof o.handle === "string" ? o.handle.slice(0, 120) : null,
      channel: typeof o.channel === "string" ? o.channel.slice(0, 40) : typeof o.platform === "string" ? o.platform.slice(0, 40) : null,
      source: typeof o.source === "string" && o.source.trim() ? o.source.trim().slice(0, 40) : "WEBHOOK",
      externalId: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 200) : o.externalId ? String(o.externalId).slice(0, 200) : null,
      body: typeof o.text === "string" && o.text.trim() ? o.text.trim().slice(0, 4000) : typeof o.body === "string" ? o.body.slice(0, 4000) : null,
      url: typeof o.url === "string" && /^https?:\/\//.test(o.url) ? o.url.slice(0, 500) : null,
      occurredAt,
    });
  }
  return out;
}

/** Map a GBP-shaped webhook body (reviews array or a single review) to signals. */
export type GoogleReviewInput = {
  reviewId?: string;
  comment?: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  createTime?: string;
  url?: string;
  title?: string;
  text?: string;
};

const GBP_RATING_LABEL: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function parseGooglePayload(b: Record<string, unknown>): RawSignalPayload[] {
  const reviews: GoogleReviewInput[] = Array.isArray(b?.reviews)
    ? (b.reviews as GoogleReviewInput[])
    : (b as GoogleReviewInput).reviewId || (b as GoogleReviewInput).comment
      ? [b as GoogleReviewInput]
      : [];
  const out: RawSignalPayload[] = [];
  for (const r of reviews) {
    const body = (typeof r.comment === "string" ? r.comment : typeof r.text === "string" ? r.text : "").trim().slice(0, 4000);
    const author = r.reviewer?.displayName?.slice(0, 120) ?? null;
    const stars = GBP_RATING_LABEL[(r.starRating ?? "").toUpperCase()];
    const title = (typeof r.title === "string" && r.title.trim() ? r.title : `GBP review — ${author ?? "customer"}${stars ? ` (${stars}★)` : ""}`).slice(0, 300);
    if (!body && !author) continue;
    const ts = r.createTime ? new Date(r.createTime) : null;
    out.push({
      title,
      author,
      channel: "GOOGLE",
      source: "GBP",
      externalId: typeof r.reviewId === "string" && r.reviewId.trim() ? r.reviewId.trim().slice(0, 200) : null,
      body: body || null,
      url: r.url && /^https?:\/\//.test(r.url) ? r.url.slice(0, 500) : null,
      occurredAt: ts && !Number.isNaN(ts.getTime()) ? ts : null,
    });
  }
  return out;
}
