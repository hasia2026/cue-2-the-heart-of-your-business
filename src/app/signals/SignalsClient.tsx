"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { agoLabel } from "@/lib/format";
import { isRtl, translate, type Locale } from "@/lib/i18n";
import {
  createWatchAction,
  toggleWatchAction,
  deleteWatchAction,
  convertToLeadAction,
  convertToInsightAction,
  dismissSignalAction,
  respondReviewAction,
} from "./actions";

type Watch = {
  id: string; name: string; keywords: string; geography: string | null;
  sourceHint: string | null; active: boolean; signalCount: number; lastSignalAt: string | null;
};
type ConvertResult = { leadId?: string; already?: boolean };

type Sig = {
  id: string; source: string; externalUrl: string | null; author: string | null;
  title: string; content: string; intent: string; matchedKeywords: string | null;
  watchName: string | null; receivedAt: string; status: string;
  convertedLeadId: string | null; convertedInsightId: string | null;
};
type Rev = {
  id: string; channel: string; authorName: string; rating: number | null;
  sentiment: string; body: string; postedAt: string; status: string;
  responseText: string | null; respondedAt: string | null;
};

const INTENT_BADGE: Record<string, string> = {
  BUY: "badge-high", SELL: "badge-purple", SERVICE: "badge-blue", OTHER: "badge-low",
};
const SOURCE_LABEL: Record<string, string> = {
  WEBHOOK: "Webhook", RSS: "RSS feed", GBP_REVIEW: "Google review", GBP_MESSAGE: "Google message",
};

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return <span className="text-accent-orange tracking-tight">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

export default function SignalsClient({
  locale,
  watches,
  signals,
  reviews,
  ingestKey,
}: {
  locale: Locale;
  watches: Watch[];
  signals: Sig[];
  reviews: Rev[];
  ingestKey: string;
}) {
  const t = (k: string) => translate(locale, k);
  const rtl = isRtl(locale);
  const router = useRouter();
  const [tab, setTab] = useState<"inbox" | "reviews" | "watches">("inbox");
  const [filter, setFilter] = useState<"ALL" | "NEW" | "BUY" | "SELL" | "SERVICE" | "CONVERTED">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const newCount = signals.filter((s) => s.status === "NEW").length;
  const unreplied = reviews.filter((r) => r.status !== "REPLIED").length;
  const avgRating = reviews.length
    ? (reviews.filter((r) => r.rating != null).reduce((s, r) => s + (r.rating ?? 0), 0) /
       Math.max(1, reviews.filter((r) => r.rating != null).length))
    : 0;

  const shown = signals.filter((s) => {
    if (filter === "ALL") return true;
    if (filter === "CONVERTED") return s.status.startsWith("CONVERTED");
    if (filter === "NEW") return s.status === "NEW";
    return s.intent === filter;
  });

  async function run(id: string, fn: () => Promise<unknown>, onDone?: (r: unknown) => void) {
    setBusyId(id);
    try {
      const result = await fn();
      onDone?.(result);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }

  const SignalCard = ({ s }: { s: Sig }) => (
    <div className="card p-4">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className={INTENT_BADGE[s.intent] ?? "badge-low"}>{s.intent}</span>
        <span className="badge-low">{SOURCE_LABEL[s.source] ?? s.source}</span>
        {s.status === "CONVERTED_LEAD" && <span className="badge-blue">→ lead created</span>}
        {s.status === "CONVERTED_INSIGHT" && <span className="badge-blue">→ opportunity</span>}
        {s.status === "DISMISSED" && <span className="badge-low">dismissed</span>}
        <span className="ml-auto text-[11px] text-navy-300">{agoLabel(s.receivedAt)}</span>
      </div>
      <div className="text-sm font-semibold text-navy-900">{s.title}</div>
      {s.author && <div className="text-xs text-navy-300 mt-0.5">by {s.author}</div>}
      <p className="text-sm text-navy-500 mt-2 whitespace-pre-wrap">{s.content}</p>
      <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-navy-300">
        {s.watchName && <span className="badge-low">📡 {s.watchName}</span>}
        {s.matchedKeywords && <span>matched: {s.matchedKeywords}</span>}
        {s.externalUrl && (
          <a href={s.externalUrl} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">view source ↗</a>
        )}
      </div>
      {s.status === "NEW" || s.status === "REVIEWED" ? (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            disabled={busyId === s.id}
            onClick={() => run(s.id, () => convertToLeadAction(s.id), (r) => {
              const res = r as ConvertResult;
              if (res?.leadId) router.push(`/pipeline/lead/${res.leadId}`);
            })}
            className="btn-primary text-xs px-3 py-1.5"
            title="Convert to a lead, auto-assign it, and open it"
          >
            + Lead ↗
          </button>
          <button
            disabled={busyId === s.id}
            onClick={() => run(s.id, () => convertToInsightAction(s.id))}
            className="btn-ghost text-xs px-3 py-1.5"
          >
            Add as opportunity
          </button>
          {s.status === "NEW" && (
            <button
              disabled={busyId === s.id}
              onClick={() => run(s.id, () => dismissSignalAction(s.id))}
              className="text-xs text-navy-300 hover:text-navy-700 px-2 py-1.5"
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={rtl ? "rtl-main" : ""}>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-navy-900">📡 {t("nav.signals")}</h1>
        {newCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent-orange text-white text-[11px] font-semibold flex items-center justify-center">
            {newCount} new
          </span>
        )}
      </div>
      <p className="text-sm text-navy-400 mb-5">
        What people are saying online about buying, selling, and servicing — captured from your watches and Google, deduped, and turned into leads or opportunities. Nothing is invented: only what actually arrived.
      </p>

      <div className="flex gap-2 mb-5">
        {([["inbox", `Signal inbox${newCount ? ` (${newCount})` : ""}`], ["reviews", `Google reviews${unreplied ? ` (${unreplied})` : ""}`], ["watches", "Watches & webhooks"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-1.5 rounded-xl text-sm transition-all ${tab === key ? "bg-gradient-to-r from-accent-blue/25 to-accent-purple/15 text-white font-medium border border-accent-blue/40" : "text-navy-400 border border-transparent hover:bg-white/[0.05]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "inbox" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(["ALL", "NEW", "BUY", "SELL", "SERVICE", "CONVERTED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${filter === f ? "border-accent-blue/50 text-white bg-accent-blue/15" : "border-navy-50 text-navy-400 hover:text-navy-700"}`}
              >
                {f === "ALL" ? "All signals" : f === "NEW" ? "Needs triage" : f === "CONVERTED" ? "Converted" : f}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="card p-8 text-center text-navy-300 text-sm">
              No signals yet. Set up a watch below, point a social-listening webhook (Brand24, Mention, Zapier, an RSS bridge…) at your ingest URL, and mentions will land here for triage.
            </div>
          ) : (
            shown.map((s) => <SignalCard key={s.id} s={s} />)
          )}
        </div>
      )}

      {tab === "reviews" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4">
              <div className="text-2xl font-bold text-navy-900">{avgRating ? avgRating.toFixed(1) : "—"}</div>
              <div className="text-xs text-navy-400">average rating</div>
            </div>
            <div className="card p-4">
              <div className="text-2xl font-bold text-navy-900">{reviews.length}</div>
              <div className="text-xs text-navy-400">reviews & messages</div>
            </div>
            <div className="card p-4">
              <div className={`text-2xl font-bold ${unreplied ? "text-accent-orange" : "text-navy-900"}`}>{unreplied}</div>
              <div className="text-xs text-navy-400">waiting for a reply</div>
            </div>
          </div>
          {reviews.length === 0 ? (
            <div className="card p-8 text-center text-navy-300 text-sm">
              No Google reviews or messages yet. Connect your Google Business Profile notifications (via Zapier/Make or the GBP API) to your ingest URL and they will appear here with response tracking.
            </div>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <Stars rating={r.rating} />
                  <span className={r.sentiment === "NEGATIVE" ? "badge-high" : r.sentiment === "POSITIVE" ? "badge-blue" : "badge-low"}>
                    {r.sentiment}
                  </span>
                  <span className="badge-low">{r.channel === "MESSAGE" ? "Message" : "Review"}</span>
                  {r.status === "REPLIED" && <span className="badge-blue">replied</span>}
                  <span className="ml-auto text-[11px] text-navy-300">{agoLabel(r.postedAt)}</span>
                </div>
                <div className="text-sm font-semibold text-navy-900">{r.authorName}</div>
                <p className="text-sm text-navy-500 mt-1.5 whitespace-pre-wrap">{r.body}</p>
                {r.status === "REPLIED" && r.responseText ? (
                  <div className="mt-3 rounded-xl bg-white/[0.04] border border-navy-50 p-3">
                    <div className="text-[11px] text-navy-300 mb-1">Your response · {r.respondedAt ? agoLabel(r.respondedAt) : ""}</div>
                    <p className="text-sm text-navy-700 whitespace-pre-wrap">{r.responseText}</p>
                  </div>
                ) : replyFor === r.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      className="input"
                      placeholder="Draft your response…"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === r.id}
                        onClick={() => run(r.id, async () => {
                          await respondReviewAction(r.id, replyText);
                          setReplyFor(null);
                          setReplyText("");
                        })}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        Save response
                      </button>
                      <button onClick={() => { setReplyFor(null); setReplyText(""); }} className="text-xs text-navy-300 hover:text-navy-700 px-2 py-1.5">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyFor(r.id); setReplyText(""); }}
                    className="mt-3 btn-ghost text-xs px-3 py-1.5"
                  >
                    ↩ Draft response
                  </button>
                )}
              </div>
            ))
          )}
          <p className="text-[11px] text-navy-300 px-1">
            Responses are recorded and tracked in CUE. Publishing the reply on Google still happens from your Google Business Profile account — CUE never posts to Google on your behalf.
          </p>
        </div>
      )}

      {tab === "watches" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {watches.map((w) => (
              <div key={w.id} className={`card p-4 ${w.active ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-navy-900">{w.name}</span>
                  {!w.active && <span className="badge-low">paused</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => run(w.id, () => toggleWatchAction(w.id, !w.active))}
                      className="text-xs text-navy-400 hover:text-navy-700 px-1.5"
                      title={w.active ? "Pause watch" : "Resume watch"}
                    >
                      {w.active ? "⏸" : "▶"}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete watch "${w.name}"? Its signals stay in the inbox.`)) run(w.id, () => deleteWatchAction(w.id)); }}
                      className="text-xs text-navy-300 hover:text-red-400 px-1.5"
                      title="Delete watch"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {w.keywords.split(",").filter(Boolean).map((k) => (
                    <span key={k} className="badge-low">{k}</span>
                  ))}
                </div>
                <div className="text-[11px] text-navy-300 space-y-0.5">
                  {w.geography && <div>📍 {w.geography}</div>}
                  {w.sourceHint && <div>🔗 pointed at: {w.sourceHint}</div>}
                  <div>{w.signalCount} signal{w.signalCount === 1 ? "" : "s"} captured{w.lastSignalAt ? ` · last ${agoLabel(w.lastSignalAt)}` : ""}</div>
                </div>
              </div>
            ))}
          </div>

          <form
            className="card p-4 space-y-3"
            action={async (fd: FormData) => { await createWatchAction(fd); router.refresh(); }}
          >
            <div className="text-sm font-semibold text-navy-900">New watch</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input name="name" required className="input" placeholder="Watch name — e.g. Local truck-buyers" />
              <input name="sourceHint" className="input" placeholder="Where you point it — Reddit, Brand24, Nextdoor…" />
              <input name="keywords" required className="input sm:col-span-2" placeholder="Keywords, comma separated — e.g. looking to buy a truck, sell my F-150, dealership service" />
              <input name="geography" className="input sm:col-span-2" placeholder="Geography (optional) — e.g. Riverside, CA" />
            </div>
            <button className="btn-primary text-sm px-4 py-2">Create watch</button>
          </form>

          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-navy-900">Connect your listening tools</div>
            <p className="text-xs text-navy-400">
              Point any social-listening webhook, RSS-to-webhook bridge, or Google Business Profile feed at these endpoints. Requests authenticate with your workspace key (Authorization: Bearer …). Duplicate alerts are ignored automatically.
            </p>
            {[
              { tag: "signals", label: "Market signals ingest", url: "/api/ingest/signals" },
              { tag: "google", label: "Google reviews & messages ingest", url: "/api/ingest/google" },
            ].map(({ tag, label, url }) => {
              const curl = `curl -X POST ${origin}${url} -H "Authorization: Bearer ${ingestKey}" -H "Content-Type: application/json" -d '{"title":"Looking to sell my Tacoma","content":"Anyone recommend a dealer near Riverside?","author":"sample_user"}'`;
              return (
                <div key={tag} className="rounded-xl bg-ink-950/60 border border-navy-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-navy-700">{label}</span>
                    <button onClick={() => copy(curl, tag)} className="ml-auto text-[11px] text-blue-300 hover:underline">
                      {copied === tag ? "Copied ✓" : "Copy curl example"}
                    </button>
                  </div>
                  <pre className="text-[11px] text-navy-400 overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
                </div>
              );
            })}
            <div className="text-[11px] text-navy-300">
              Workspace ingest key: <code className="text-navy-600 select-all">{ingestKey}</code>
              <button onClick={() => copy(ingestKey, "key")} className="ml-2 text-blue-300 hover:underline">
                {copied === "key" ? "Copied ✓" : "copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
