"use client";

import { useState } from "react";
import Link from "next/link";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import type { DrawerInsight, DrawerRec, EvidenceRef } from "@/components/EvidenceDrawer";
import { money } from "@/lib/format";
import { decideRecommendation, createWorkflowFromRec, dismissInsight, refreshInsights } from "@/app/actions";

type InsightRow = {
  id: string; title: string; summary: string; severity: string; type: string;
  impactValue: number | null; confidence: number; status: string; recId: string | null;
};

export default function UnderstandClient({
  insights,
  entities,
  counts,
}: {
  insights: InsightRow[];
  entities: {
    id: string; type: string; name: string; description: string | null;
    facts: { id: string; statement: string; status: string; confidence: number }[];
  }[];
  counts: { facts: number; knowledge: number; documents: number };
}) {
  const [drawer, setDrawer] = useState<{
    insight: DrawerInsight; rec: DrawerRec | null; evidence: EvidenceRef[];
    audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function openInsight(id: string) {
    const res = await fetch(`/api/insight/${id}`);
    if (res.ok) setDrawer(await res.json());
  }

  async function handleAction(kind: "approve" | "workflow" | "dismiss") {
    if (!drawer) return;
    setBusy(true);
    try {
      if (kind === "approve" && drawer.rec) await decideRecommendation(drawer.rec.id, "APPROVED");
      else if (kind === "workflow" && drawer.rec) await createWorkflowFromRec(drawer.rec.id);
      else if (kind === "dismiss") await dismissInsight(drawer.insight.id);
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await refreshInsights();
    } finally {
      setBusy(false);
    }
  }

  const open = insights.filter((i) => i.status === "OPEN");
  const decided = insights.filter((i) => i.status !== "OPEN");

  return (
    <div className="space-y-6">
      {/* Pattern detection header */}
      <section className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Business intelligence</h2>
          <p className="muted mt-0.5">
            Patterns CUE detects from your records: revenue leakage · missed follow-ups · bottlenecks · neglected customers. {counts.facts} verified facts · {counts.knowledge} knowledge items from {counts.documents} sources.
          </p>
        </div>
        <button onClick={refresh} disabled={busy} className="btn-secondary">
          {busy ? "Computing…" : "↻ Re-scan data"}
        </button>
      </section>

      {/* Open insights */}
      <section>
        <h2 className="section-title mb-3">Open insights & recommendations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {open.map((i) => (
            <button
              key={i.id}
              onClick={() => openInsight(i.id)}
              className="card card-hover p-5 text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={i.severity === "HIGH" ? "badge-high" : i.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>{i.severity}</span>
                <span className="badge-blue">{i.type}</span>
                {i.impactValue != null && (
                  <span className="ml-auto text-sm font-bold text-accent-blue">{money(i.impactValue)}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-navy-900 leading-snug">{i.title}</div>
              <p className="text-xs text-navy-500 mt-1.5 line-clamp-2">{i.summary}</p>
              <div className="mt-3 text-xs font-medium text-accent-blue">Inspect evidence →</div>
            </button>
          ))}
          {open.length === 0 && (
            <p className="muted">No open insights. Capture more information or re-scan the data.</p>
          )}
        </div>
      </section>

      {/* Entities & facts */}
      <section className="card p-5">
        <h2 className="section-title mb-1">Knowledge extraction</h2>
        <p className="muted mb-4">Entities CUE has identified, with the facts attached to them. Facts are supported by records; assumptions need confirmation.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entities.map((e) => (
            <div key={e.id} className="rounded-xl border border-navy-100 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-purple">{e.type}</span>
                <span className="text-sm font-semibold text-navy-900">{e.name}</span>
              </div>
              {e.description && <p className="text-xs text-navy-500">{e.description}</p>}
              <div className="mt-3 space-y-2">
                {e.facts.map((f) => (
                  <div key={f.id} className="text-xs text-navy-600 border-l-2 border-navy-100 pl-2.5">
                    {f.statement}
                    <div className="mt-1 flex gap-1.5">
                      <span className={f.status === "FACT" ? "badge-green" : "badge-medium"}>{f.status}</span>
                      <span className="badge-low">{Math.round(f.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {entities.length === 0 && <p className="muted">Entities appear here as information is captured.</p>}
        </div>
      </section>

      {/* Decided insights */}
      {decided.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-3">Decision history</h2>
          <div className="space-y-2.5">
            {decided.map((i) => (
              <button key={i.id} onClick={() => openInsight(i.id)} className="w-full flex items-center gap-3 text-left rounded-xl border border-navy-100 px-4 py-3 hover:bg-navy-50 transition-colors">
                <span className={i.status === "ACTION_TAKEN" ? "badge-green" : i.status === "DISMISSED" ? "badge-low" : "badge-blue"}>{i.status}</span>
                <span className="text-sm text-navy-800 flex-1">{i.title}</span>
                <span className="text-xs text-accent-blue">View audit →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {drawer && (
        <EvidenceDrawer
          insight={drawer.insight}
          rec={drawer.rec}
          evidence={drawer.evidence}
          audit={drawer.audit}
          onClose={() => setDrawer(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
