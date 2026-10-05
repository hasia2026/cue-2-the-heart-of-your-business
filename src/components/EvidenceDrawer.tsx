"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Bundle = {
  insight: {
    id: string; title: string; summary: string; severity: string; type: string;
    impact_value: number | string | null; confidence: number; reasoning: string; status: string;
  };
  rec: { id: string; title: string; action: string; rationale: string; impact: string | null; status: string } | null;
  evidence: { items: { label: string; kind: string }[] };
  audit: { action: string; actor_type: string; detail: string | null; created_at: string }[];
};

export default function EvidenceDrawer({ insightId }: { insightId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    setErr(null);
    if (data) return;
    const res = await fetch(`/api/insight/${insightId}`);
    if (res.ok) setData(await res.json());
    else setErr("Could not load this insight.");
  }

  async function decide(kind: "APPROVED" | "REJECTED" | "DEFERRED") {
    if (!data?.rec) return;
    setBusy(true);
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recId: data.rec.id, decision: kind }),
    });
    setBusy(false);
    if (res.ok) {
      const fresh = await fetch(`/api/insight/${insightId}`);
      if (fresh.ok) setData(await fresh.json());
      router.refresh();
    } else {
      setErr("Decision failed — are you signed in?");
    }
  }

  return (
    <>
      <button onClick={load} className="btn-ghost !px-2.5 !py-1 text-xs">Why? · Act →</button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-s border-white/10 bg-ink-900 p-5" onClick={(e) => e.stopPropagation()}>
            {!data && <div className="muted">{err ?? "Loading…"}</div>}
            {data && (
              <div className="space-y-5">
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`badge ${data.insight.severity === "HIGH" ? "badge-red" : data.insight.severity === "MEDIUM" ? "badge-orange" : "badge-low"}`}>
                      {data.insight.severity}
                    </span>
                    <span className="badge-blue">{data.insight.type}</span>
                    <span className="ms-auto text-xs text-navy-300">Confidence {Math.round(Number(data.insight.confidence) * 100)}%</span>
                  </div>
                  <h2 className="text-lg font-bold text-white">{data.insight.title}</h2>
                  <p className="muted mt-1">{data.insight.summary}</p>
                </div>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-navy-300">Evidence</h3>
                  <ul className="space-y-1.5">
                    {data.evidence.items.map((e, i) => (
                      <li key={i} className="card px-3 py-2 text-sm">
                        <span className="badge-low me-2">{e.kind}</span>
                        {e.label}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-navy-300">Why CUE thinks this</h3>
                  <p className="muted">{data.insight.reasoning}</p>
                </section>

                {data.insight.impact_value != null && (
                  <section className="card p-3">
                    <div className="text-xs uppercase tracking-widest text-navy-300">Business impact</div>
                    <div className="kpi mt-1">${Number(data.insight.impact_value).toLocaleString()}</div>
                  </section>
                )}

                {data.rec && (
                  <section className="card p-4">
                    <div className="text-xs font-semibold uppercase tracking-widest text-cue-blue">Recommended action</div>
                    <div className="mt-1 font-semibold text-white">{data.rec.title}</div>
                    <p className="muted mt-1">{data.rec.action}</p>
                    <p className="mt-2 text-xs text-navy-300">{data.rec.rationale}</p>
                    {data.rec.impact && <p className="mt-1 text-xs text-cue-green">→ {data.rec.impact}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button disabled={busy || data.rec.status !== "PENDING"} onClick={() => decide("APPROVED")} className="btn-green text-xs">Approve</button>
                      <button disabled={busy || data.rec.status !== "PENDING"} onClick={() => decide("REJECTED")} className="btn-danger text-xs">Reject</button>
                      <button disabled={busy || data.rec.status !== "PENDING"} onClick={() => decide("DEFERRED")} className="btn-ghost text-xs">Defer</button>
                      {data.rec.status !== "PENDING" && (
                        <span className="badge-purple self-center">Decision: {data.rec.status}</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-navy-300/70">
                      Consequential actions are never automatic — CUE prepares, you decide. Approving lets you generate the workflow in Execute.
                    </p>
                  </section>
                )}

                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-navy-300">Audit history</h3>
                  <ul className="space-y-1 text-xs text-navy-300">
                    {data.audit.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-navy-300/60">{new Date(a.created_at).toLocaleString()}</span>
                        <span className="text-navy-100">{a.action}</span>
                        {a.detail && <span className="truncate">— {a.detail}</span>}
                      </li>
                    ))}
                    {data.audit.length === 0 && <li>No audit entries yet.</li>}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
