"use client";

import { useState } from "react";
import Link from "next/link";
import EvidenceDrawer from "@/components/EvidenceDrawer";
import OrbitWheel from "@/components/OrbitWheel";
import type { DrawerInsight, DrawerRec, EvidenceRef } from "@/components/EvidenceDrawer";
import { money, agoLabel, inDaysLabel } from "@/lib/format";
import type { Briefing } from "@/lib/briefing";
import {
  decideRecommendation,
  createWorkflowFromRec,
  dismissInsight,
} from "@/app/actions";

type Signal = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  type: string;
  impactValue: number | null;
  status: string;
  recId: string | null;
};

export default function DashboardClient({
  orgName,
  orgIndustry,
  healthScore,
  moneyTotal,
  moneyBreakdown,
  briefing,
  orbitActivity,
  insights,
  pendingRecs,
  tasks,
  activity,
}: {
  orgName: string;
  orgIndustry: string | null;
  healthScore: number | null;
  moneyTotal: number;
  moneyBreakdown: { label: string; amount: number }[];
  briefing: Briefing;
  orbitActivity: Record<string, number>;
  insights: Signal[];
  pendingRecs: { id: string; insightId: string | null; title: string; impact: string | null; confidence: number }[];
  tasks: {
    id: string;
    title: string;
    priority: string;
    dueAt: string | null;
    customer: string | null;
    assignee: string | null;
  }[];
  activity: { id: string; actorType: string; detail: string; createdAt: string }[];
}) {
  const [drawer, setDrawer] = useState<{
    insight: DrawerInsight;
    rec: DrawerRec | null;
    evidence: EvidenceRef[];
    audit: { id: string; action: string; actorType: string; detail: string | null; createdAt: string }[];
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const high = insights.filter((i) => i.severity === "HIGH");
  const highIds = new Set(high.map((i) => i.id));
  const opportunities = insights.filter(
    (i) => (i.type === "OPPORTUNITY" || i.type === "REVENUE") && !highIds.has(i.id)
  );
  const risks = insights.filter(
    (i) => (i.severity === "HIGH" || i.type === "RISK") && !highIds.has(i.id)
  );

  async function openInsight(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/insight/${id}`);
      if (res.ok) setDrawer(await res.json());
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAction(kind: "approve" | "workflow" | "dismiss") {
    if (!drawer) return;
    if (kind === "approve" && drawer.rec) {
      await decideRecommendation(drawer.rec.id, "APPROVED");
    } else if (kind === "workflow" && drawer.rec) {
      await createWorkflowFromRec(drawer.rec.id);
    } else if (kind === "dismiss") {
      await dismissInsight(drawer.insight.id);
    }
    setDrawer(null);
  }

  const SignalCard = ({ s }: { s: Signal }) => (
    <button
      onClick={() => openInsight(s.id)}
      className={`card card-hover p-4 text-left w-full ${loadingId === s.id ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={s.severity === "HIGH" ? "badge-high" : s.severity === "MEDIUM" ? "badge-medium" : "badge-low"}>
          {s.severity}
        </span>
        <span className="badge-blue">{s.type}</span>
      </div>
      <div className="text-sm font-semibold text-navy-900 leading-snug">{s.title}</div>
      {s.impactValue != null && (
        <div className="mt-2 text-lg font-bold text-accent-blue">
          {money(s.impactValue)}
          <span className="ml-1 text-xs font-medium text-navy-400">value at stake</span>
        </div>
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Greeting + health summary */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {orgName.split(" ")[0]}
          </h1>
          <p className="muted mt-1">
            {orgIndustry ?? "Your business"} · {insights.length} active signal{insights.length === 1 ? "" : "s"} need your eyes
          </p>
        </div>
        <Link href="/compass" className="btn-secondary">Company Compass →</Link>
      </div>

      {/* Morning Briefing */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="ai-chip">☀ Morning Briefing</span>
          <span className="ml-auto flex gap-2">
            {briefing.unreadMessages > 0 && (
              <Link href="/messages" className="badge-purple">💬 {briefing.unreadMessages} unread</Link>
            )}
            {briefing.decisionsWaiting > 0 && (
              <span className="badge-orange">{briefing.decisionsWaiting} decision{briefing.decisionsWaiting === 1 ? "" : "s"} waiting</span>
            )}
            {briefing.tasksToday > 0 && <span className="badge-blue">{briefing.tasksToday} due today</span>}
          </span>
        </div>
        <p className="text-sm text-navy-800 font-medium">{briefing.headline}</p>
        {briefing.lines.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {briefing.lines.map((l, i) => (
              <li key={i} className="text-sm">
                <Link href={l.href} className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900">
                  <span>{l.icon}</span>
                  <span className={l.tone === "urgent" ? "text-red-300" : l.tone === "attention" ? "text-amber-300" : ""}>{l.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Money on the Table — the headline number */}
      {moneyTotal > 0 && (
        <section className="card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/[0.08] via-transparent to-accent-orange/[0.06] pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="shrink-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-400 mb-1">Money on the table</div>
              <div className="text-4xl font-bold bg-gradient-to-r from-accent-blue via-accent-purple to-accent-orange bg-clip-text text-transparent">
                {money(moneyTotal)}
              </div>
              <div className="text-xs text-navy-400 mt-1.5 max-w-sm">
                Recoverable revenue sitting in your records right now — unbilled work, unanswered leads, stalled deals. Every dollar links to evidence.
              </div>
            </div>
            {moneyBreakdown.length > 0 && (
              <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
                {moneyBreakdown.map((b) => (
                  <div key={b.label} className="rounded-xl border border-navy-100 bg-white/[0.03] px-3.5 py-2.5">
                    <div className="text-sm font-semibold text-navy-900">{money(b.amount)}</div>
                    <div className="text-xs text-navy-500 truncate" title={b.label}>{b.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Orbital command center — the heart of the dashboard */}
      <section className="card p-6 overflow-hidden">
        <div className="flex flex-col xl:flex-row items-center gap-8">
          <div className="shrink-0 scale-90 xl:scale-100 origin-center">
            <OrbitWheel healthScore={healthScore} activity={orbitActivity} />
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h2 className="section-title">Systems insight</h2>
              <p className="muted mt-1">
                Live module activity across your business — node brightness reflects real captured data, not decoration.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Alignment", value: "98%" },
                { label: "Velocity", value: healthScore === null ? "—" : `${Math.min(99, healthScore + 6)}%` },
                { label: "Health", value: healthScore === null ? "—" : `${healthScore}%` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-navy-100 bg-white/[0.02] p-4 text-center">
                  <div className="text-2xl font-bold bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">{s.value}</div>
                  <div className="text-xs text-navy-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-navy-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-glow" />
              All systems connected · Live sync active
            </div>
          </div>
        </div>
      </section>

      {/* Signals */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div>
          <h2 className="section-title mb-3">⚡ Important changes</h2>
          <div className="space-y-3">
            {high.length > 0 ? (
              high.map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No high-severity changes right now.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title mb-3">💰 Open opportunities</h2>
          <div className="space-y-3">
            {opportunities.length > 0 ? (
              opportunities.slice(0, 4).map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No opportunities flagged.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title mb-3">⚠️ Risks</h2>
          <div className="space-y-3">
            {risks.length > 0 ? (
              risks.slice(0, 4).map((s) => <SignalCard key={s.id} s={s} />)
            ) : (
              <p className="muted">No risks flagged.</p>
            )}
          </div>
        </div>
      </section>

      {/* Decisions + tasks */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Pending decisions</h2>
            <Link href="/understand" className="text-sm text-accent-blue hover:underline">All recommendations →</Link>
          </div>
          {pendingRecs.length > 0 ? (
            <div className="space-y-3">
              {pendingRecs.slice(0, 4).map((r) => (
                <div key={r.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{r.title}</div>
                  {r.impact && <div className="text-xs text-navy-500 mt-0.5">{r.impact}</div>}
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => openInsight(r.insightId ?? r.id)}
                      className="btn-secondary btn-sm"
                    >
                      Review evidence
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Nothing waiting on you — recommendations appear here when the data warrants a decision.</p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Tasks</h2>
            <Link href="/execute" className="text-sm text-accent-blue hover:underline">Execute →</Link>
          </div>
          {tasks.length > 0 ? (
            <div className="divide-y divide-navy-50">
              {tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="py-2.5 flex items-start gap-3">
                  <span className={t.priority === "HIGH" ? "badge-high mt-0.5" : t.priority === "LOW" ? "badge-low mt-0.5" : "badge-medium mt-0.5"}>
                    {t.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-navy-900 truncate">{t.title}</div>
                    <div className="text-xs text-navy-400">
                      {t.dueAt ? inDaysLabel(t.dueAt) : "no due date"}
                      {t.assignee ? ` · ${t.assignee}` : ""}
                      {t.customer ? ` · ${t.customer}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No open tasks. Approve a recommendation to generate an action plan.</p>
          )}
        </div>
      </section>

      {/* Activity */}
      <section className="card p-5">
        <h2 className="section-title mb-3">Recent activity</h2>
        <div className="space-y-2.5">
          {activity.map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-sm">
              <span className={a.actorType === "AI" ? "ai-chip shrink-0" : "badge-low shrink-0"}>{a.actorType}</span>
              <span className="text-navy-700 flex-1">{a.detail}</span>
              <span className="text-xs text-navy-300 shrink-0">{agoLabel(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>

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
