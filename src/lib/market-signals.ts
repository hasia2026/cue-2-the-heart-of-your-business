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

/**
 * AI fallback for signals the keyword rules miss. Same bring-your-own-key
 * chain as the AI Ambassador: the org's configured provider first, then the
 * server-level env keys (GROQ → ANTHROPIC → XAI → GEMINI). Returns null when
 * no LLM is configured or the answer is unusable — the signal is simply
 * stored unclassified, exactly like the keyword-only behavior.
 */
export async function aiClassifyIntent(
  organizationId: string,
  title: string,
  body: string | null,
): Promise<SignalIntent | null> {
  try {
    const { getAmbassadorConfig } = await import("./ambassador");
    const cfg = await getAmbassadorConfig(organizationId);
    if (!cfg.provider || !cfg.apiKey) return null;
    const text = `${title}\n${body ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!text) return null;

    const system =
      "You classify social posts and reviews for an automotive/HVAC service business. " +
      "Answer with exactly ONE word and nothing else: BUY, SELL, SERVICE, or UNKNOWN. " +
      "BUY = the person wants to buy or is asking for recommendations on what/where to buy. " +
      "SELL = the person wants to sell or trade in something they own. " +
      "SERVICE = the person needs repair, maintenance, inspection, or an appointment. " +
      "UNKNOWN = none of those.";
    let out = "";
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model || "claude-haiku-4-5", max_tokens: 8, system, messages: [{ role: "user", content: text }] }),
      });
      if (!res.ok) return null;
      const j = await res.json() as { content?: { text?: string }[] };
      out = (j.content?.[0]?.text ?? "").trim();
    } else if (cfg.provider === "google") {
      const model = cfg.model || "gemini-2.0-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 8 },
        }),
      });
      if (!res.ok) return null;
      const j = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      out = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    } else {
      // OpenAI-compatible: groq, openai, openrouter, xai
      const endpoint =
        cfg.provider === "openai" ? "https://api.openai.com/v1/chat/completions"
        : cfg.provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions"
        : cfg.provider === "xai" ? "https://api.x.ai/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";
      const model = cfg.model || (cfg.provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "system", content: system }, { role: "user", content: text }] }),
      });
      if (!res.ok) return null;
      const j = await res.json() as { choices?: { message?: { content?: string } }[] };
      out = (j.choices?.[0]?.message?.content ?? "").trim();
    }
    const verdict = out.toUpperCase().replace(/[^A-Z]/g, "");
    return verdict === "BUY" || verdict === "SELL" || verdict === "SERVICE" ? (verdict as SignalIntent) : null;
  } catch {
    return null; // graceful: an unreachable LLM never blocks the ingest
  }
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
 */export async function ingestSignal(s: SignalInput): Promise<{ created: boolean; id: string | null; intent: SignalIntent | null }> {
  const hash = signalHash(s.organizationId, s);
  // Keyword rules first (free, instant); the AI classifies what they miss.
  let intent = classifyIntent(`${s.title} ${s.body ?? ""}`);
  if (!intent) intent = await aiClassifyIntent(s.organizationId, s.title, s.body);
  const [row] = await sql`
    insert into market_signals
      (organization_id, kind, source, external_id, author, channel, title, body, url, intent, signal_hash, occurred_at)
    values
      (${s.organizationId}, ${s.kind}, ${s.source}, ${s.externalId}, ${s.author}, ${s.channel},
       ${s.title}, ${s.body}, ${s.url}, ${intent}, ${hash}, ${s.occurredAt})
    on conflict (organization_id, signal_hash) do nothing
    returning id`;
  return { created: !!row, id: row?.id ?? null, intent };
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

// ── BUY-intent pilot alert ────────────────────────────────────────────────────
// Hot-signal whisper: a newly created BUY-intent signal is someone asking to
// buy. It routes to the SAME owner inbox as scan-lead alerts — email via
// Resend (failures retried by the lead_alert_queue cron), Web Push whisper to
// registered devices. Fire-and-forget: ingest never fails because of an alert.
export async function notifyBuySignal(s: {
  title: string;
  author: string | null;
  channel: string | null;
  source: string;
  body: string | null;
  url: string | null;
  kind: SignalKind;
}): Promise<void> {
  try {
    const [{ pilotInboxEmails, enqueueFailedAlert }, { sendMail, mailerConnected }] = await Promise.all([
      import("./leads"),
      import("./mailer"),
    ]);
    const targets = pilotInboxEmails();
    const channel = s.channel ?? s.source;
    const subject = `New BUY-intent signal — ${channel}${s.author ? ` (${s.author})` : ""}`;
    const text = [
      `Someone is asking to buy. Arrived via ${s.kind === "GBP" ? "Google Business Profile" : "a social-listening webhook"}.`,
      ``,
      `Signal: ${s.title}`,
      s.body ? `"${s.body.slice(0, 500)}${s.body.length > 500 ? "..." : ""}"` : null,
      s.author ? `By: ${s.author}` : null,
      s.url ? `Source: ${s.url}` : null,
      ``,
      `Convert it while it's hot: Signals -> Lead. Follow up within one business day.`,
    ].filter((v) => v !== null).join("\n");

    if (!mailerConnected()) {
      console.warn("BUY-signal alert skipped — mailer not configured (signal still stored)");
    } else {
      try {
        const result = await sendMail({ to: targets, subject, text });
        if (!result.sent) {
          console.error("BUY-signal alert failed:", result.error ?? "unknown mailer error");
          if (result.connected) await enqueueFailedAlert(targets, subject, text, result.error ?? "unknown mailer error");
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.error("BUY-signal alert failed:", err);
        await enqueueFailedAlert(targets, subject, text, err);
      }
    }

    // Real-time whisper — best effort, logged, never blocks.
    try {
      const { pushPilotAlert } = await import("./push");
      const pushed = await pushPilotAlert(`BUY signal: ${s.title.slice(0, 60)}`, `${channel}${s.author ? ` · ${s.author}` : ""}`, "/signals");
      if (!pushed.ok) console.warn("BUY-signal push inconclusive:", pushed.detail);
    } catch (e) {
      console.warn("BUY-signal push failed:", e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error("BUY-signal alert crashed (ingest unaffected):", e instanceof Error ? e.message : String(e));
  }
}
