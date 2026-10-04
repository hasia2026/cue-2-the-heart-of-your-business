"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money, agoLabel } from "@/lib/format";
import { isRtl, translate, type Locale } from "@/lib/i18n";
import { setDealStageAction } from "./actions";

type Lead = {
  id: string; name: string; source: string; interest: string | null; estValue: number | null;
  status: string; assignee: string | null; customerId: string | null; customerName: string | null;
  createdAt: string; lastContactAt: string | null;
  responseState: "handled" | "due" | "late"; minutesWaiting: number | null;
};
type Deal = {
  id: string; customer: string; customerId: string; vehicle: string | null; dealType: string;
  status: string; amount: number; createdAt: string; closedAt: string | null;
};
type Customer = {
  id: string; name: string; email: string | null; phone: string | null; type: string;
  servicePlan: string | null; dealCount: number; serviceOrderCount: number;
  invoiceCount: number; commCount: number;
};

const STAGES = ["NEGOTIATING", "PENDING_FINANCE", "WON", "LOST"] as const;
const STAGE_MOVES: Record<string, { label: string; to: string }[]> = {
  NEGOTIATING: [
    { label: "→ Sent to finance", to: "PENDING_FINANCE" },
    { label: "✓ Won", to: "WON" },
    { label: "✕ Lost", to: "LOST" },
  ],
  PENDING_FINANCE: [
    { label: "← Back to negotiating", to: "NEGOTIATING" },
    { label: "✓ Won", to: "WON" },
    { label: "✕ Lost", to: "LOST" },
  ],
  WON: [{ label: "← Reopen", to: "NEGOTIATING" }],
  LOST: [{ label: "← Reopen", to: "NEGOTIATING" }],
};

const SOURCE_LABEL: Record<string, string> = {
  WEB: "Web", PHONE: "Phone", WALK_IN: "Walk-in", REFERRAL: "Referral",
  MARKET: "📡 Market signal", GBP: "★ Google", CSV: "CSV import",
};

function ResponseBadge({ lead, targetMin }: { lead: Lead; targetMin: number }) {
  if (lead.responseState === "handled") {
    return <span className="badge-blue">answered {lead.lastContactAt ? agoLabel(lead.lastContactAt) : ""}</span>;
  }
  if (lead.responseState === "late") {
    const hrs = lead.minutesWaiting != null ? Math.floor(lead.minutesWaiting / 60) : null;
    return (
      <span className="badge-high">
        {hrs != null && hrs >= 1 ? `no response ${hrs}h${lead.minutesWaiting! % 60 ? ` ${lead.minutesWaiting! % 60}m` : ""}` : `no response ${lead.minutesWaiting}m`}
      </span>
    );
  }
  return <span className="badge-medium">respond within {targetMin}m</span>;
}

export default function PipelineClient({
  locale, leads, deals, customers, responseTargetMin,
}: {
  locale: Locale; leads: Lead[]; deals: Deal[]; customers: Customer[]; responseTargetMin: number;
}) {
  const t = (k: string) => translate(locale, k);
  const rtl = isRtl(locale);
  const router = useRouter();
  const [tab, setTab] = useState<"leads" | "deals" | "customers">("leads");
  const [leadFilter, setLeadFilter] = useState<"NEEDS_RESPONSE" | "ALL" | "NEW" | "WORKED">("NEEDS_RESPONSE");
  const [busyId, setBusyId] = useState<string | null>(null);

  const waiting = leads.filter((l) => l.responseState !== "handled" && (l.status === "NEW" || l.status === "CONTACTED"));
  const openDeals = deals.filter((d) => d.status === "NEGOTIATING" || d.status === "PENDING_FINANCE");
  const pipelineValue = openDeals.reduce((s, d) => s + d.amount, 0);

  const shownLeads = leads.filter((l) => {
    if (leadFilter === "ALL") return true;
    if (leadFilter === "NEW") return l.status === "NEW";
    if (leadFilter === "WORKED") return l.status !== "NEW";
    return l.status === "NEW" && l.responseState !== "handled";
  });

  async function moveStage(dealId: string, to: string) {
    setBusyId(dealId);
    try {
      await setDealStageAction(dealId, to);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const LeadRow = ({ l }: { l: Lead }) => (
    <Link
      href={`/pipeline/lead/${l.id}`}
      className="card card-hover p-4 block"
    >
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={l.status === "NEW" ? "badge-high" : l.status === "WON" ? "badge-blue" : l.status === "LOST" ? "badge-low" : "badge-purple"}>
          {l.status}
        </span>
        {l.status === "NEW" && <ResponseBadge lead={l} targetMin={responseTargetMin} />}
        <span className="badge-low">{SOURCE_LABEL[l.source] ?? l.source}</span>
        {l.estValue != null && (
          <span className="ml-auto text-sm font-semibold text-accent-blue">{money(l.estValue)}<span className="text-[11px] font-normal text-navy-400"> est.</span></span>
        )}
      </div>
      <div className="text-sm font-semibold text-navy-900">{l.name}</div>
      {l.interest && <div className="text-xs text-navy-400 mt-0.5">{l.interest}</div>}
      <div className="flex items-center gap-2 text-[11px] text-navy-300 mt-1.5 flex-wrap">
        <span>in {agoLabel(l.createdAt)}</span>
        {l.assignee && <span>· assigned to {l.assignee}</span>}
        {l.customerId && <span>· customer record ✓</span>}
      </div>
    </Link>
  );

  return (
    <div className={rtl ? "rtl-main" : ""}>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold text-navy-900">Pipeline</h1>
        {waiting.length > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent-orange text-white text-[11px] font-semibold flex items-center justify-center">
            {waiting.length} need response
          </span>
        )}
      </div>
      <p className="text-sm text-navy-400 mb-5">
        Leads, deals, and customers in one working view — {openDeals.length} open deal{openDeals.length === 1 ? "" : "s"} worth {money(pipelineValue)}. Every lead honors the {responseTargetMin}-minute response standard.
      </p>

      <div className="flex gap-2 mb-5">
        {([["leads", `Leads (${leads.length})`], ["deals", `Deals (${deals.length})`], ["customers", `Customers (${customers.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-1.5 rounded-xl text-sm transition-all ${tab === key ? "bg-gradient-to-r from-accent-blue/25 to-accent-purple/15 text-white font-medium border border-accent-blue/40" : "text-navy-400 border border-transparent hover:bg-white/[0.05]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "leads" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([["NEEDS_RESPONSE", `Needs response (${waiting.length})`], ["NEW", "All new"], ["WORKED", "Worked"], ["ALL", "All leads"]] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setLeadFilter(f)}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${leadFilter === f ? "border-accent-blue/50 text-white bg-accent-blue/15" : "border-navy-50 text-navy-400 hover:text-navy-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {shownLeads.length === 0 ? (
            <div className="card p-8 text-center text-navy-300 text-sm">
              Nothing here. New leads arrive from your website forms, CSV imports, and market-signal conversions.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {shownLeads.map((l) => <LeadRow key={l.id} l={l} />)}
            </div>
          )}
        </div>
      )}

      {tab === "deals" && (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const col = deals.filter((d) => d.status === stage);
            const total = col.reduce((s, d) => s + d.amount, 0);
            return (
              <div key={stage} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${stage === "WON" ? "text-blue-300" : stage === "LOST" ? "text-navy-300" : "text-navy-700"}`}>
                    {stage === "PENDING_FINANCE" ? "Pending finance" : stage.charAt(0) + stage.slice(1).toLowerCase()}
                  </span>
                  <span className="text-[11px] text-navy-300">{col.length} · {money(total)}</span>
                </div>
                {col.map((d) => (
                  <div key={d.id} className={`card p-3.5 ${busyId === d.id ? "opacity-60" : ""}`}>
                    <div className="text-sm font-semibold text-navy-900">{d.customer}</div>
                    {d.vehicle && <div className="text-xs text-navy-400 mt-0.5">{d.vehicle}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="badge-low">{d.dealType}</span>
                      <span className="ml-auto text-sm font-bold text-accent-blue">{money(d.amount)}</span>
                    </div>
                    <div className="text-[11px] text-navy-300 mt-1.5">
                      {d.closedAt ? `closed ${agoLabel(d.closedAt)}` : `open ${agoLabel(d.createdAt)}`}
                    </div>
                    <div className="flex gap-1.5 flex-wrap mt-2.5">
                      {(STAGE_MOVES[d.status] ?? []).map((m) => (
                        <button
                          key={m.to}
                          disabled={busyId === d.id}
                          onClick={() => moveStage(d.id, m.to)}
                          className={`text-[11px] px-2 py-1 rounded-lg border transition-all ${m.to === "WON" ? "border-blue-400/40 text-blue-300 hover:bg-blue-400/10" : m.to === "LOST" ? "border-navy-50 text-navy-300 hover:text-navy-700" : "border-navy-100 text-navy-400 hover:text-navy-800"}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {col.length === 0 && <div className="text-[11px] text-navy-300 px-1 py-3">—</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "customers" && (
        <div className="space-y-3">
          {customers.map((c) => (
            <Link key={c.id} href={`/pipeline/customer/${c.id}`} className="card card-hover p-4 flex items-center gap-4 flex-wrap">
              <div className="min-w-40">
                <div className="text-sm font-semibold text-navy-900">{c.name}</div>
                <div className="text-[11px] text-navy-300">{c.email ?? "—"} · {c.phone ?? "—"}</div>
              </div>
              {c.servicePlan && <span className="badge-blue">{c.servicePlan}</span>}
              <span className="badge-low">{c.type}</span>
              <div className="ml-auto flex items-center gap-3 text-[11px] text-navy-400">
                <span>{c.dealCount} deal{c.dealCount === 1 ? "" : "s"}</span>
                <span>{c.serviceOrderCount} service</span>
                <span>{c.invoiceCount} invoice{c.invoiceCount === 1 ? "" : "s"}</span>
                <span>{c.commCount} touch{c.commCount === 1 ? "" : "es"}</span>
              </div>
            </Link>
          ))}
          {customers.length === 0 && (
            <div className="card p-8 text-center text-navy-300 text-sm">No customers yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
