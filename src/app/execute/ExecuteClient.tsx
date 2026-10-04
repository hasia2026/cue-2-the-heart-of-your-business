"use client";

import { useState } from "react";
import { completeTask } from "@/app/actions";
import { inDaysLabel, money } from "@/lib/format";
import type { ImpactReceipt } from "@/lib/impact";

type Task = {
  id: string; title: string; detail: string | null; status: string; priority: string;
  dueAt: string | null; customer: string | null; assignee: string | null;
  workflowTitle: string | null; origin: string;
};

export default function ExecuteClient({
  receipts,
  tasks,
  workflows,
  projects,
}: {
  receipts: ImpactReceipt[];
  tasks: Task[];
  workflows: {
    id: string; title: string; kind: string; status: string; source: string;
    taskCount: number; recTitle: string | null; createdAt: string;
  }[];
  projects: { id: string; title: string; description: string | null; status: string; dueAt: string | null }[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"tasks" | "workflows" | "projects" | "receipts">("tasks");

  async function done(id: string) {
    setBusyId(id);
    try {
      await completeTask(id);
    } finally {
      setBusyId(null);
    }
  }

  const open = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const finished = tasks.filter((t) => t.status === "DONE");

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1.5">
        {(["tasks", "workflows", "projects", "receipts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`badge ${tab === t ? "badge-blue" : "badge-low"} capitalize`}
          >
            {t === "receipts" ? "impact receipts" : t}
            {t === "tasks" && ` (${open.length} open)`}
            {t === "workflows" && ` (${workflows.length})`}
            {t === "projects" && ` (${projects.length})`}
            {t === "receipts" && receipts.length > 0 && ` (${receipts.length})`}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <>
          <section className="card divide-y divide-navy-50">
            <div className="px-5 py-3.5 flex items-center justify-between">
              <h2 className="section-title">Open tasks</h2>
              <span className="text-xs text-navy-400">{open.length} open · {finished.length} completed</span>
            </div>
            {open.map((t) => (
              <div key={t.id} className="px-5 py-4 flex items-start gap-3">
                <button
                  onClick={() => done(t.id)}
                  disabled={busyId === t.id}
                  title="Mark complete"
                  className="mt-0.5 h-5 w-5 rounded-md border-2 border-navy-200 hover:border-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy-900">{t.title}</div>
                  {t.detail && <div className="text-xs text-navy-500 mt-0.5">{t.detail}</div>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={t.priority === "HIGH" ? "badge-high" : t.priority === "MEDIUM" ? "badge-medium" : "badge-low"}>{t.priority}</span>
                    {t.dueAt && <span className="badge-low">⏱ {inDaysLabel(t.dueAt)}</span>}
                    {t.customer && <span className="badge-blue">◍ {t.customer}</span>}
                    {t.assignee && <span className="badge-low">👤 {t.assignee}</span>}
                    {t.workflowTitle && <span className="badge-purple">⚡ {t.workflowTitle}</span>}
                    {t.origin === "WORKFLOW" && <span className="ai-chip">from recommendation</span>}
                  </div>
                </div>
              </div>
            ))}
            {open.length === 0 && (
              <div className="px-5 py-8 text-center muted">No open tasks. Approve a recommendation in Understand to generate an action plan.</div>
            )}
          </section>

          {finished.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-2">Recently completed</h2>
              <div className="space-y-1.5">
                {finished.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm text-navy-500">
                    <span className="text-emerald-500">✓</span>
                    <span className="line-through flex-1">{t.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "workflows" && (
        <section className="grid gap-4 md:grid-cols-2">
          {workflows.map((w) => (
            <div key={w.id} className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-purple">{w.kind}</span>
                <span className={w.status === "ACTIVE" ? "badge-green" : "badge-low"}>{w.status}</span>
                <span className="ml-auto text-xs text-navy-400">{w.taskCount} task{w.taskCount === 1 ? "" : "s"}</span>
              </div>
              <div className="text-sm font-semibold text-navy-900">{w.title}</div>
              {w.recTitle && (
                <div className="text-xs text-navy-500 mt-1">
                  Created from recommendation: <span className="text-navy-700">{w.recTitle}</span>
                </div>
              )}
              <div className="text-[11px] text-navy-300 mt-2">{new Date(w.createdAt).toLocaleDateString()} · {w.source}</div>
            </div>
          ))}
          {workflows.length === 0 && <p className="muted">No workflows yet. “Create workflow” on a recommendation generates one.</p>}
        </section>
      )}

      {tab === "receipts" && (
        <section className="space-y-4">
          <div className="card p-5">
            <h2 className="section-title">Impact receipts</h2>
            <p className="muted mt-1 text-sm">
              Proof that decisions produced results. Each receipt traces an approved recommendation through its tasks to the dollars that materialized — computed from your actual invoice and payment records, not estimates.
            </p>
            {receipts.length > 0 && (
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl border border-navy-100 bg-white/[0.03] p-4 text-center">
                  <div className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-accent-blue bg-clip-text text-transparent">{money(receipts.reduce((s, r) => s + r.collected, 0))}</div>
                  <div className="text-xs text-navy-400 mt-1">collected via workflows</div>
                </div>
                <div className="rounded-xl border border-navy-100 bg-white/[0.03] p-4 text-center">
                  <div className="text-2xl font-bold text-navy-900">{receipts.reduce((s, r) => s + r.completedCount, 0)}</div>
                  <div className="text-xs text-navy-400 mt-1">actions completed</div>
                </div>
                <div className="rounded-xl border border-navy-100 bg-white/[0.03] p-4 text-center">
                  <div className="text-2xl font-bold text-navy-900">{money(receipts.reduce((s, r) => s + r.pending, 0))}</div>
                  <div className="text-xs text-navy-400 mt-1">still in play</div>
                </div>
              </div>
            )}
          </div>
          {receipts.map((r) => (
            <div key={r.workflowId} className="card p-5">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="badge-purple">receipt</span>
                <span className={r.status === "COMPLETED" ? "badge-green" : "badge-blue"}>{r.status.replace("_", " ").toLowerCase()}</span>
                {r.projected !== null && <span className="badge-low">projected {money(r.projected)}</span>}
                <span className="ml-auto text-xs text-navy-400">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="text-sm font-semibold text-navy-900">{r.workflowTitle}</div>
              {r.recTitle && (
                <div className="text-xs text-navy-500 mt-0.5">From decision: {r.recTitle}</div>
              )}
              <div className="mt-3 rounded-xl border border-navy-100 bg-white/[0.03] px-4 py-3 text-sm">
                <span className="text-navy-700">{r.story}</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-blue to-emerald-400 transition-all"
                  style={{ width: `${Math.round((r.completedCount / Math.max(1, r.taskCount)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-navy-400 mt-1.5">
                <span>{r.completedCount}/{r.taskCount} tasks done</span>
                <span>{r.collected > 0 ? `${money(r.collected)} collected` : `${money(r.pending)} pending`}</span>
              </div>
            </div>
          ))}
          {receipts.length === 0 && (
            <p className="muted">No workflows yet. Approve a recommendation and create its workflow — the receipt will track what it delivers.</p>
          )}
        </section>
      )}

      {tab === "projects" && (
        <section className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-blue">{p.status}</span>
                {p.dueAt && <span className="badge-low">due {new Date(p.dueAt).toLocaleDateString()}</span>}
              </div>
              <div className="text-sm font-semibold text-navy-900">{p.title}</div>
              {p.description && <p className="text-sm text-navy-500 mt-1">{p.description}</p>}
            </div>
          ))}
          {projects.length === 0 && <p className="muted">No projects.</p>}
        </section>
      )}
    </div>
  );
}
