"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeTask, decideRec, generateWorkflow } from "./actions";

export type Task = { id: string; title: string; detail: string | null; status: string; priority: string; assignee: string | null; workflowTitle: string | null };
export type WF = { id: string; title: string; kind: string; status: string; taskCount: number; recId: string | null };
export type Rec = { id: string; title: string; action: string };
export type PendingRec = { id: string; title: string; action: string; impactValue: string | number | null };

export default function ExecuteClient({ tasks, workflows, approvedRecs, pendingRecs, canDecide, labels }: {
  tasks: Task[]; workflows: WF[]; approvedRecs: Rec[];
  pendingRecs: PendingRec[]; canDecide: boolean; labels: Record<string, string>;
}) {
  const t = (k: string) => labels[k] ?? k;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(taskId: string, done: boolean) {
    if (done) return;
    setBusyId(taskId);
    try {
      await completeTask(taskId);
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  async function buildWorkflow(recId: string) {
    setBusyId(recId);
    setMsg(null);
    try {
      const r = await generateWorkflow(recId);
      setMsg(`Workflow created with ${r.taskCount} task(s) — owners assigned, deadlines set. You stay in control of each one.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(recId: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(recId);
    setMsg(null);
    try {
      await decideRec(recId, decision);
      setMsg(decision === "APPROVED" ? t("approvals.approved") : t("approvals.rejectedMsg"));
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-xl border border-cue-green/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{msg}</div>}

      {pendingRecs.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-1">{t("approvals.title")}</h2>
          <p className="muted mb-3 text-xs">{t("approvals.subtitle")}</p>
          <div className="space-y-2">
            {pendingRecs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-navy-100">{r.title}</div>
                  <div className="text-xs text-navy-300/70">{r.action}</div>
                </div>
                {r.impactValue != null && Number(r.impactValue) > 0 && (
                  <span className="text-sm font-semibold text-cue-green">+${Number(r.impactValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                )}
                {canDecide && (
                  <div className="flex gap-2">
                    <button disabled={busyId === r.id || pending} onClick={() => decide(r.id, "APPROVED")} className="btn-primary !py-1.5 text-xs">
                      {busyId === r.id ? "…" : t("approvals.approve")}
                    </button>
                    <button disabled={busyId === r.id || pending} onClick={() => decide(r.id, "REJECTED")} className="btn-ghost !py-1.5 text-xs">
                      {t("approvals.reject")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {approvedRecs.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-1">Approved — ready to become workflows</h2>
          <p className="muted mb-3 text-xs">One click generates tasks with owners and context. Nothing runs automatically.</p>
          <div className="space-y-2">
            {approvedRecs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-navy-100">{r.title}</div>
                  <div className="text-xs text-navy-300/70">{r.action}</div>
                </div>
                <button disabled={busyId === r.id || pending} onClick={() => buildWorkflow(r.id)} className="btn-primary text-xs">
                  {busyId === r.id ? "Building…" : "Create workflow →"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title mb-3">Workflows ({workflows.length})</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {workflows.map((w) => (
            <div key={w.id} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="badge-blue">{w.kind.replace("_", " ")}</span>
                {w.recId && <span className="badge-purple">from AI rec</span>}
                <span className={`badge ms-auto ${w.status === "ACTIVE" ? "badge-green" : "badge-low"}`}>{w.status}</span>
              </div>
              <div className="mt-2 font-semibold text-white">{w.title}</div>
              <div className="muted mt-1 text-xs">{w.taskCount} task(s)</div>
            </div>
          ))}
          {workflows.length === 0 && <div className="card p-5 muted">No workflows yet. Approve a recommendation in Understand, then create one here.</div>}
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">Tasks ({tasks.filter((t) => t.status !== "DONE").length} open)</h2>
        <div className="space-y-2">
          {tasks.map((t) => (
            <label key={t.id} className={`card card-hover flex cursor-pointer items-start gap-3 p-4 ${t.status === "DONE" ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={t.status === "DONE"}
                disabled={busyId === t.id || pending || t.status === "DONE"}
                onChange={() => toggle(t.id, t.status === "DONE")}
                className="mt-1 h-4 w-4 accent-emerald-400"
              />
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${t.status === "DONE" ? "text-navy-300 line-through" : "text-navy-100"}`}>{t.title}</div>
                {t.detail && <div className="muted mt-0.5 text-xs">{t.detail}</div>}
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-navy-300/70">
                  <span className={`badge ${t.priority === "HIGH" ? "badge-red" : "badge-low"}`}>{t.priority}</span>
                  {t.assignee && <span>👤 {t.assignee}</span>}
                  {t.workflowTitle && <span className="truncate">⌗ {t.workflowTitle}</span>}
                </div>
              </div>
            </label>
          ))}
          {tasks.length === 0 && <div className="card p-5 muted">No tasks yet.</div>}
        </div>
      </section>
    </div>
  );
}
