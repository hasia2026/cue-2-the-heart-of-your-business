"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money, agoLabel } from "@/lib/format";
import { isRtl, type Locale } from "@/lib/i18n";
import { setLeadStatusAction, logLeadContactAction } from "../../actions";

type Lead = {
  id: string; name: string; source: string; interest: string | null; estValue: number | null;
  status: string; assignee: { id: string; name: string; title: string } | null;
  customerId: string | null; customerName: string | null;
  createdAt: string; lastContactAt: string | null;
  responseState: "handled" | "due" | "late"; minutesWaiting: number | null;
};
type Comm = { id: string; channel: string; direction: string; summary: string; occurredAt: string };
type Deal = { id: string; status: string; amount: number; vehicle: string | null; createdAt: string };
type Signal = { id: string; title: string; source: string; externalUrl: string | null; author: string | null; content: string; receivedAt: string };

const CHANNELS = [
  { key: "PHONE", label: "📞 Call" },
  { key: "EMAIL", label: "✉ Email" },
  { key: "SMS", label: "💬 Text" },
  { key: "IN_PERSON", label: "🤝 In person" },
] as const;

export default function LeadDetailClient({
  locale, lead, comms, deals, originSignal, responseTargetMin,
}: {
  locale: Locale; lead: Lead; comms: Comm[]; deals: Deal[];
  originSignal: Signal | null; responseTargetMin: number;
}) {
  const rtl = isRtl(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<string>("PHONE");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [summary, setSummary] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function saveContact() {
    if (summary.trim().length < 2) return;
    setBusy(true);
    try {
      await logLeadContactAction(lead.id, { channel, direction, summary, email, phone: phone || undefined });
      setSummary("");
      setEmail("");
      setPhone("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await setLeadStatusAction(lead.id, status);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={rtl ? "rtl-main" : ""}>
      <div className="flex items-center gap-2 text-xs text-navy-300 mb-2">
        <Link href="/pipeline" className="hover:text-navy-700">← Pipeline</Link>
        <span>/</span>
        <span>Lead</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-navy-900">{lead.name}</h1>
        <span className={lead.status === "NEW" ? "badge-high" : lead.status === "WON" ? "badge-blue" : lead.status === "LOST" ? "badge-low" : "badge-purple"}>
          {lead.status}
        </span>
        {lead.responseState === "late" && <span className="badge-high">⚠ no response for {lead.minutesWaiting}m — {responseTargetMin}m rule broken</span>}
        {lead.responseState === "due" && <span className="badge-medium">respond within {responseTargetMin}m</span>}
        {lead.responseState === "handled" && lead.lastContactAt && <span className="badge-blue">last contact {agoLabel(lead.lastContactAt)}</span>}
      </div>
      <div className="flex items-center gap-2 text-sm text-navy-400 flex-wrap mb-5">
        {lead.interest && <span>{lead.interest}</span>}
        {lead.estValue != null && <span>· est. {money(lead.estValue)}</span>}
        <span>· via {lead.source}</span>
        {lead.assignee && <span>· assigned to <strong className="text-navy-700">{lead.assignee.name}</strong> ({lead.assignee.title})</span>}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Log contact */}
          <div className="card p-4 space-y-3">
            <div className="text-sm font-semibold text-navy-900">
              Log a contact {lead.customerId ? "" : <span className="text-[11px] font-normal text-navy-300">— creates the customer record on first log</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {CHANNELS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setChannel(c.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${channel === c.key ? "border-accent-blue/50 text-white bg-accent-blue/15" : "border-navy-50 text-navy-400 hover:text-navy-700"}`}
                >
                  {c.label}
                </button>
              ))}
              <button
                onClick={() => setDirection(direction === "OUTBOUND" ? "INBOUND" : "OUTBOUND")}
                className="ml-auto text-[11px] text-navy-400 hover:text-navy-700 px-2"
                title="Toggle direction"
              >
                {direction === "OUTBOUND" ? "we reached out →" : "← they contacted us"}
              </button>
            </div>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="input"
              placeholder={channel === "PHONE" ? "e.g. Left voicemail, offered test drive Saturday 10am…" : "What happened?"}
            />
            {!lead.customerId && (
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Email (optional)" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="Phone (optional)" />
              </div>
            )}
            <div className="flex gap-2">
              <button disabled={busy || summary.trim().length < 2} onClick={saveContact} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
                Log contact
              </button>
              {lead.customerId && (
                <Link href={`/pipeline/customer/${lead.customerId}`} className="btn-ghost text-sm px-4 py-2">
                  Open customer 360
                </Link>
              )}
            </div>
          </div>

          {/* Communication timeline */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 px-1">Contact history</div>
            {comms.length === 0 ? (
              <div className="card p-5 text-center text-navy-300 text-sm">No contact logged yet.</div>
            ) : (
              comms.map((c) => (
                <div key={c.id} className="card p-3.5 flex gap-3">
                  <span className="text-lg" title={c.channel}>
                    {c.channel === "PHONE" ? "📞" : c.channel === "EMAIL" ? "✉" : c.channel === "SMS" ? "💬" : "🤝"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-navy-300">{c.direction === "INBOUND" ? "they said" : "we said"} · {agoLabel(c.occurredAt)}</span>
                    </div>
                    <p className="text-sm text-navy-700 mt-0.5">{c.summary}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Origin signal */}
          {originSignal && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Origin</div>
              <div className="text-sm font-semibold text-navy-900">{originSignal.title}</div>
              {originSignal.author && <div className="text-xs text-navy-300 mt-0.5">by {originSignal.author}</div>}
              <p className="text-xs text-navy-500 mt-2 line-clamp-4">{originSignal.content}</p>
              <div className="mt-2 text-[11px] text-navy-300">
                received {agoLabel(originSignal.receivedAt)} · {originSignal.source}
                {originSignal.externalUrl && (
                  <> · <a href={originSignal.externalUrl} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">view post ↗</a></>
                )}
              </div>
              <Link href="/signals" className="inline-block mt-2 text-[11px] text-blue-300 hover:underline">open signal inbox →</Link>
            </div>
          )}

          {/* Status moves */}
          <div className="card p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-1">Move status</div>
            <div className="flex gap-1.5 flex-wrap">
              {(["CONTACTED", "QUALIFIED", "WON", "LOST"] as const).map((s) => (
                <button
                  key={s}
                  disabled={busy || lead.status === s}
                  onClick={() => setStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-xl border transition-all disabled:opacity-40 ${s === "WON" ? "border-blue-400/40 text-blue-300 hover:bg-blue-400/10" : s === "LOST" ? "border-navy-50 text-navy-300 hover:text-navy-700" : "border-navy-100 text-navy-400 hover:text-navy-800"}`}
                >
                  {s === "CONTACTED" ? "Mark contacted" : s === "QUALIFIED" ? "Qualify" : s === "WON" ? "✓ Won" : "✕ Lost"}
                </button>
              ))}
            </div>
          </div>

          {/* Linked deals */}
          {deals.length > 0 && (
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Deals</div>
              {deals.map((d) => (
                <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-navy-50 last:border-0">
                  <span className="badge-low">{d.status}</span>
                  <span className="text-xs text-navy-500">{d.vehicle ?? "No vehicle"}</span>
                  <span className="ml-auto text-sm font-semibold text-accent-blue">{money(d.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
