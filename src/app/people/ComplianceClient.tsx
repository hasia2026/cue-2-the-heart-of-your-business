"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgePolicy } from "./compliance-actions";

type PolicyDoc = { id: string; title: string; kind: string; uploadedAt: string };
type Employee = { id: string; name: string; title: string };
type Ack = { documentId: string; employeeId: string; employeeName: string; acknowledgedAt: string; signature: string };

export default function ComplianceClient({
  policyDocs,
  employees,
  acknowledgments,
}: {
  policyDocs: PolicyDoc[];
  employees: Employee[];
  acknowledgments: Ack[];
}) {
  const router = useRouter();
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ackMap = useMemo(() => {
    const m = new Map<string, Ack>();
    for (const a of acknowledgments) m.set(`${a.documentId}:${a.employeeId}`, a);
    return m;
  }, [acknowledgments]);

  const coverage = useMemo(() => {
    if (policyDocs.length === 0 || employees.length === 0) return 0;
    const total = policyDocs.length * employees.length;
    const done = policyDocs.reduce(
      (s, d) => s + employees.filter((e) => ackMap.has(`${d.id}:${e.id}`)).length,
      0
    );
    return Math.round((done / total) * 100);
  }, [policyDocs, employees, ackMap]);

  async function submit(e: React.FormEvent<HTMLFormElement>, documentId: string) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("documentId", documentId);
    try {
      await acknowledgePolicy(fd);
      setMsg("Acknowledgment recorded — timestamped and audit-logged.");
      startTransition(() => router.refresh());
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to record acknowledgment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="section-title">Policy compliance</h2>
        <span className={coverage >= 90 ? "badge-green" : coverage >= 50 ? "badge-medium" : "badge-high"}>
          {coverage}% acknowledged
        </span>
        <span className="ml-auto text-xs text-navy-400">Audit-ready record: who signed which policy, and when</span>
      </div>
      <p className="muted text-sm mb-4">
        Every captured policy can be acknowledged by your team with a typed signature — timestamped, versioned, and logged for FTC Safeguards / HR audits.
      </p>

      {msg && (
        <div className="mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm text-emerald-200">{msg}</div>
      )}

      <div className="space-y-2">
        {policyDocs.map((d) => {
          const signed = employees.filter((e) => ackMap.has(`${d.id}:${e.id}`));
          const missing = employees.filter((e) => !ackMap.has(`${d.id}:${e.id}`));
          const open = openDoc === d.id;
          return (
            <div key={d.id} className="rounded-xl border border-navy-50 bg-white/[0.02]">
              <button
                onClick={() => setOpenDoc(open ? null : d.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] rounded-xl transition-colors"
              >
                <span className="badge-blue shrink-0">{d.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-navy-900 truncate">{d.title}</span>
                  <span className="block text-xs text-navy-400">
                    {signed.length}/{employees.length} acknowledged
                  </span>
                </span>
                <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                  <div
                    className="h-full bg-gradient-to-r from-accent-blue to-emerald-400"
                    style={{ width: `${employees.length ? Math.round((signed.length / employees.length) * 100) : 0}%` }}
                  />
                </div>
                <span className={`text-navy-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
              </button>

              {open && (
                <div className="px-4 pb-4 border-t border-navy-50 mt-1 pt-3">
                  {signed.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 mb-1.5">Acknowledged</div>
                      <div className="flex flex-wrap gap-1.5">
                        {signed.map((e) => {
                          const a = ackMap.get(`${d.id}:${e.id}`)!;
                          return (
                            <span key={e.id} className="badge-green" title={`Signed "${a.signature}"`}>
                              ✓ {e.name} · {new Date(a.acknowledgedAt).toLocaleDateString()}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {missing.length > 0 ? (
                    <form onSubmit={(e) => submit(e, d.id)} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="label">Team member</label>
                        <select name="employeeId" required className="input">
                          {missing.map((e) => (
                            <option key={e.id} value={e.id}>{e.name} — {e.title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Typed signature (full name)</label>
                        <input name="signature" required minLength={2} className="input" placeholder="e.g. Dana Whitfield" />
                      </div>
                      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Recording…" : "Record"}</button>
                    </form>
                  ) : (
                    <p className="text-sm text-emerald-300">✓ Everyone has acknowledged this policy.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {policyDocs.length === 0 && (
          <p className="muted">No policy or procedure documents captured yet — add them in Capture and they appear here for acknowledgment.</p>
        )}
      </div>
    </section>
  );
}
