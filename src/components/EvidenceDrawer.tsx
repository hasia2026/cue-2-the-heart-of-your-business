"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";

export type DrawerInsight = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  type: string;
  impactValue: number | null;
  confidence: number;
  reasoning: string;
  status: string;
  recId: string | null;
  createdAt: string;
};

export type DrawerRec = {
  id: string;
  title: string;
  action: string;
  rationale: string;
  impact: string | null;
  impactValue: number | null;
  confidence: number;
  status: string;
};

export type EvidenceRef = {
  kind: string;
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

const CONFIDENCE_LABEL: Record<number, string> = {
  0.97: "High",
  0.95: "High",
  0.85: "Medium",
  0.8: "Medium",
  0.75: "Medium",
  0.7: "Medium",
  0.5: "Low",
};

export function confidenceLabel(n: number): string {
  if (n >= 0.85) return "High";
  return n >= 0.7 ? "Medium" : "Low";
}

export default function EvidenceDrawer({
  insight,
  rec,
  evidence,
  audit,
  onClose,
  onAction,
}: {
  insight: DrawerInsight;
  rec: DrawerRec | null;
  evidence: EvidenceRef[];
  audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  onClose: () => void;
  onAction: (kind: "approve" | "workflow" | "dismiss") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [acted, setActed] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(kind: "approve" | "workflow" | "dismiss") {
    setBusy(true);
    await onAction(kind);
    setActed(kind);
    setBusy(false);
  }

  const decided = insight.status !== "OPEN";

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Insight detail">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-navy-100 px-6 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={insight.severity === "HIGH" ? "badge-high" : insight.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>
                {insight.severity}
              </span>
              <span className="badge-blue">{insight.type}</span>
              <span className="ai-chip">✦ CUE insight</span>
            </div>
            <h2 className="text-lg font-semibold text-navy-900 leading-snug">{insight.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm shrink-0" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 1. What happened */}
          <section>
            <SectionLabel>What happened</SectionLabel>
            <p className="text-sm text-navy-700">{insight.summary}</p>
          </section>

          {/* 2. Why CUE noticed */}
          <section>
            <SectionLabel>Why CUE noticed</SectionLabel>
            <p className="text-sm text-navy-700">{insight.reasoning}</p>
          </section>

          {/* 3. Evidence */}
          <section>
            <SectionLabel>
              Evidence · {evidence.length} record{evidence.length === 1 ? "" : "s"}
            </SectionLabel>
            <div className="rounded-xl border border-navy-100 divide-y divide-navy-50 max-h-72 overflow-y-auto">
              {evidence.map((e, i) => (
                <div key={e.id + i} className="px-4 py-3 flex items-start gap-3">
                  <span className="badge-low shrink-0 mt-0.5">{e.kind}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-900">{e.label}</div>
                    <div className="text-xs text-navy-500 mt-0.5">{e.detail}</div>
                  </div>
                  {typeof e.amount === "number" && (
                    <div className="text-sm font-semibold text-navy-900 shrink-0">{money(e.amount)}</div>
                  )}
                  <div className="text-[10px] text-navy-300 shrink-0 self-center" title="Record in this workspace">Ref {i + 1}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-navy-400">
              Every item above is an actual record in this workspace — click any dashboard signal to audit the chain Signal → Evidence → Understanding → Decision → Action.
            </p>
          </section>

          {/* 4. Business impact + 5. Recommended action */}
          {rec && (
            <section className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/30 p-4">
              <SectionLabel>Recommended action</SectionLabel>
              <div className="text-sm font-semibold text-navy-900">{rec.title}</div>
              <p className="text-sm text-navy-700 mt-1">{rec.rationale}</p>
              {rec.impact && <p className="text-sm text-navy-700 mt-2"><span className="font-medium">Impact:</span> {rec.impact}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="badge-purple">Confidence: {CONFIDENCE_LABEL[rec.confidence] ?? confidenceLabel(rec.confidence)}</span>
                {rec.impactValue != null && <span className="badge-blue">Value at stake: {money(rec.impactValue)}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {decided ? (
                  <div className="text-sm text-navy-600">
                    {insight.status === "ACTION_TAKEN" ? "✓ Action taken — workflow created and tasks assigned." : `Decision recorded: ${insight.status.toLowerCase()}.`}
                  </div>
                  ) : (
                  <>
                    <button disabled={busy} onClick={() => act("approve")} className="btn-primary">Approve</button>
                    <button disabled={busy} onClick={() => act("workflow")} className="btn-purple">Create workflow</button>
                    <button disabled={busy} onClick={() => act("dismiss")} className="btn-secondary">Dismiss</button>
                  </>
                )}
              </div>
            </section>
          )}
          {!rec && !decided && (
            <p className="text-sm text-navy-500">No recommendation attached — this is an informational insight.</p>
          )}

          {/* 7. Audit history */}
          <section>
            <SectionLabel>Audit history</SectionLabel>
            <ol className="space-y-2">
              {audit.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className={a.actorType === "AI" ? "ai-chip shrink-0" : "badge-low shrink-0"}>{a.actorType}</span>
                  <div>
                    <div className="text-navy-800">{a.detail ?? a.action}</div>
                    <div className="text-xs text-navy-400">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1.5">
      {children}
    </div>
  );
}
