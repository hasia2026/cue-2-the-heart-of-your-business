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
      "UNKNOWN = none of those. " +
      "Bias: when a post is actionable — someone wants something done on their property or vehicle, urgently or soon, " +
      "and no provider is named yet — answer BUY. Urgent breakdowns ('my AC is not cooling, who can help?'), " +
      "'who can check/look at/sort out my X', and requests for company recommendations all count. " +
      "Only plain routine maintenance scheduling, routine star-rating reviews with no request, and chatter with no " +
      "intent to act stay SERVICE or UNKNOWN. A missed sale costs far more than one extra alert.";
    let out = "";
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model || "claude-haiku-4-5", max_tokens: 300, system, messages: [{ role: "user", content: text }] }),
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
          generationConfig: { maxOutputTokens: 300 },
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
        body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: "system", content: system }, { role: "user", content: text }] }),
      });
      if (!res.ok) return null;
      const j = await res.json() as { choices?: { message?: { content?: string } }[] };
      out = (j.choices?.[0]?.message?.content ?? "").trim();
    }
    // Reasoning models (gpt-oss etc.) may emit thinking around the answer;
    // match the verdict word anywhere and take the LAST occurrence.
    const matches = [...out.toUpperCase().matchAll(/\b(BUY|SELL|SERVICE|UNKNOWN)\b/g)];
    const verdict = matches.at(-1)?.[1];
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

// ── Hot-signal pilot alert ───────────────────────────────────────────────────
// Hot-signal whisper: a newly created actionable signal — someone asking to
// buy (BUY) or urgent, actionable service (SERVICE) — is emailed to the SAME
// owner inbox as scan-lead alerts via Resend (failures retried by the
// lead_alert_queue cron). Devices get ONE batched Web Push whisper per ingest
// batch (pushSignalBatch). Every attempt lands in signal_alert_ledger so the
// Signals page can show recent alerts and failures are traceable in-app.
// Fire-and-forget: ingest never fails because of an alert.
export async function notifySignalAlert(s: {
  organizationId: string;
  signalId: string | null;
  title: string;
  intent: "BUY" | "SERVICE";
  author: string | null;
  channel: string | null;
  source: string;
  body: string | null;
  url: string | null;
  kind: SignalKind;
}): Promise<void> {
  try {
    const [{ pilotInboxEmails, enqueueFailedAlert }, { sendMail, mailerConnected }, { sql }] = await Promise.all([
      import("./leads"),
      import("./mailer"),
      import("./db"),
    ]);
    const targets = pilotInboxEmails();
    const channel = s.channel ?? s.source;
    const subject = `New ${s.intent === "BUY" ? "BUY-intent" : "urgent service"} signal — ${channel}${s.author ? ` (${s.author})` : ""}`;
    // The owner reads this on a phone between jobs — every alert carries two
    // links: the original post when the provider supplied one (or exact search
    // instructions when it didn't), and the CUE Signals inbox to convert it.
    const appUrl = (process.env.APP_URL ?? "http://localhost:3210").replace(/\/+$/, "");
    const signalsLink = `${appUrl}/signals`;
    const provenance = s.url
      ? `Where it was posted:\n${s.url}`
      : `No direct link came with this signal — search “${s.title}” on ${channel}${s.author ? `, by ${s.author}` : ""}.`;
    const text = [
      `Someone is ${s.intent === "BUY" ? "asking to buy" : "asking for service now — they can be converted today"}. Arrived via ${s.kind === "GBP" ? "Google Business Profile" : "a social-listening webhook"}.`,
      ``,
      `Signal: ${s.title}`,
      s.body ? `"${s.body.slice(0, 500)}${s.body.length > 500 ? "..." : ""}"` : null,
      s.author ? `By: ${s.author}` : null,
      ``,
      provenance,
      ``,
      `Open the Signals inbox in CUE:`,
      signalsLink,
      ``,
      `Convert it while it's hot: Signals → Lead, then follow up within one business day.`,
    ].filter((v) => v !== null).join("\n");

    const esc = (t: string) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const btn = (href: string, label: string) =>
      `<a href="${esc(href)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${label}</a>`;
    const html = `<div style="font:16px/1.5 system-ui,-apple-system,sans-serif;color:#111827;max-width:560px">` +
      `<p style="margin:0 0 12px">Someone is ${s.intent === "BUY" ? "<b>asking to buy</b>" : "<b>asking for service now</b>"} — they can be converted today. Arrived via ${esc(s.kind === "GBP" ? "Google Business Profile" : "a social-listening webhook")} on <b>${esc(channel)}</b>.</p>` +
      `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #7c3aed;background:#f5f3ff;border-radius:8px">` +
      `<b>${esc(s.title)}</b>` +
      (s.body ? `<br><span style="color:#374151">“${esc(s.body.slice(0, 500))}${s.body.length > 500 ? "…" : ""}”</span>` : "") +
      (s.author ? `<br><span style="color:#6b7280;font-size:13px">by ${esc(s.author)}</span>` : "") +
      `</blockquote>` +
      (s.url
        ? `<p style="margin:0 0 12px">The post itself: <a href="${esc(s.url)}" style="color:#7c3aed;font-weight:600">open it ↗</a></p>`
        : `<p style="margin:0 0 12px;color:#6b7280">No direct link came with this signal — search <b>“${esc(s.title)}”</b> on ${esc(channel)}${s.author ? `, by ${esc(s.author)}` : ""}.</p>`) +
      `<p style="margin:0 0 16px">${btn(signalsLink, "Open CUE Signals →")}</p>` +
      `<p style="margin:0;color:#6b7280;font-size:13px">Respond within one business day — open the inbox, convert the signal to a Lead, and follow up.</p>` +
      `</div>`;

    let emailStatus: "SENT" | "FAILED" = "SENT";
    let emailDetail: string | null = null;
    if (!mailerConnected()) {
      emailStatus = "FAILED";
      emailDetail = "mailer not configured (RESEND_API_KEY unset) — email is the alert of record";
      console.warn("hot-signal alert skipped — mailer not configured (signal still stored)");
    } else {
      try {
        const result = await sendMail({ to: targets, subject, text, html });
        if (!result.sent) {
          emailStatus = "FAILED";
          emailDetail = result.error ?? "unknown mailer error";
          console.error("hot-signal alert failed:", emailDetail);
          if (result.connected) await enqueueFailedAlert(targets, subject, text, result.error ?? "unknown mailer error");
        }
      } catch (e) {
        emailStatus = "FAILED";
        emailDetail = e instanceof Error ? e.message : String(e);
        console.error("hot-signal alert failed:", emailDetail);
        await enqueueFailedAlert(targets, subject, text, emailDetail);
      }
    }

    // Ledger row for the Signals page (never blocks ingest).
    try {
      await sql`
        insert into signal_alert_ledger (organization_id, signal_id, kind, intent, subject, status, detail)
        values (${s.organizationId}, ${s.signalId}, 'EMAIL', ${s.intent}, ${subject}, ${emailStatus}, ${emailDetail})`;
    } catch (e) {
      console.error("signal_alert_ledger insert failed:", e instanceof Error ? e.message : String(e));
    }
  } catch (e) {
    console.error("hot-signal alert crashed (ingest unaffected):", e instanceof Error ? e.message : String(e));
  }
}

/** One Web Push whisper per hot-signal ingest batch (not per signal). */
export async function pushSignalBatch(organizationId: string, batch: {
  count: number;
  intent: "BUY" | "SERVICE";
  firstTitle: string;
  moreCount: number; // how many AFTER the first one were in the same batch
}): Promise<void> {
  try {
    const { pushPilotAlert } = await import("./push");
    const subject = `${batch.count} new hot signal${batch.count === 1 ? "" : "s"} (${batch.intent})`;
    const body = `${batch.firstTitle.slice(0, 70)}${batch.moreCount > 0 ? ` +${batch.moreCount} more` : ""} — open Signals to convert them.`;
    const pushed = await pushPilotAlert(subject, body, "/signals");

    // Ledger row for the Signals page (never blocks ingest).
    try {
      const { sql } = await import("./db");
      await sql`
        insert into signal_alert_ledger (organization_id, kind, intent, subject, status, detail)
        values (${organizationId}, 'PUSH', ${batch.intent}, ${subject}, ${pushed.ok ? "SENT" : "SKIPPED"}, ${pushed.detail ?? null})`;
    } catch { /* ledger is best-effort */ }

    if (!pushed.ok) console.warn("hot-signal batch push inconclusive:", pushed.detail);
  } catch (e) {
    console.warn("hot-signal batch push failed:", e instanceof Error ? e.message : String(e));
  }
}
