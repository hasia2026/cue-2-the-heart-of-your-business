"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDocument, deleteDocument } from "./manage-actions";

type Doc = {
  id: string;
  title: string;
  fileName: string;
  kind: string;
  status: string;
  extractedText: string | null;
  departmentId: string | null;
  uploadedAt: string;
  knowledgeCount: number;
};

const KINDS = ["POLICY", "PROCEDURE", "CONTRACT", "RECORD", "NOTE", "SPREADSHEET", "MEDIA", "OTHER"];

export default function DocumentManager({
  docs,
  departments,
}: {
  docs: Doc[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function call(action: (fd: FormData) => Promise<{ ok: boolean }>, fd: FormData, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      await action(fd);
      setMsg(okMsg);
      setEditingId(null);
      setConfirmId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const open = docs.find((d) => d.id === openId) ?? null;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="section-title">Captured items ({docs.length})</h2>
        <span className="ml-auto text-xs text-navy-400">Click an item to view · edit · move · delete</span>
      </div>

      {msg && (
        <div className="mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm text-emerald-200">
          {msg}
        </div>
      )}

      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="rounded-xl border border-navy-50 bg-white/[0.02]">
            <button
              onClick={() => { setOpenId(openId === d.id ? null : d.id); setEditingId(null); setConfirmId(null); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] rounded-xl transition-colors"
            >
              <span className="badge-blue shrink-0">{d.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-navy-900 truncate">{d.title}</span>
                <span className="block text-xs text-navy-400 truncate">
                  {d.fileName} · {new Date(d.uploadedAt).toLocaleDateString()}
                  {d.knowledgeCount > 0 && ` · ${d.knowledgeCount} knowledge item${d.knowledgeCount > 1 ? "s" : ""}`}
                  {d.departmentId && ` · ${departments.find((x) => x.id === d.departmentId)?.name ?? ""}`}
                </span>
              </span>
              <span className={`text-navy-400 transition-transform ${openId === d.id ? "rotate-90" : ""}`}>›</span>
            </button>

            {openId === d.id && (
              <div className="px-4 pb-4 pt-1 border-t border-navy-50 mt-1">
                {editingId === d.id ? (
                  /* ── Edit form ── */
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      fd.set("id", d.id);
                      call(updateDocument, fd, "Updated — knowledge and search kept in sync.");
                    }}
                    className="space-y-3 mt-3"
                  >
                    <div>
                      <label className="label">Title</label>
                      <input name="title" defaultValue={d.title} required className="input" />
                    </div>
                    <div>
                      <label className="label">Captured text</label>
                      <textarea name="extractedText" rows={6} defaultValue={d.extractedText ?? ""} className="input font-mono text-xs" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Classification</label>
                        <select name="kind" defaultValue={d.kind} className="input">
                          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Move to department</label>
                        <select name="departmentId" defaultValue={d.departmentId ?? ""} className="input">
                          <option value="">— None —</option>
                          {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save changes"}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="btn-ghost">Cancel</button>
                    </div>
                  </form>
                ) : (
                  /* ── View mode ── */
                  <>
                    <div className="mt-3 rounded-xl bg-black/20 border border-navy-50 p-4 max-h-72 overflow-y-auto">
                      {d.extractedText ? (
                        <p className="text-sm text-navy-600 whitespace-pre-wrap font-mono">{d.extractedText}</p>
                      ) : (
                        <p className="text-sm text-navy-400 italic">No text was extracted for this item.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => setEditingId(d.id)} className="btn-primary !py-1.5 text-sm">✎ Edit</button>
                      <span className="text-xs text-navy-400 self-center px-1">Edit title, text, classification, or move departments</span>
                      {confirmId === d.id ? (
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-red-300">Delete permanently (incl. {d.knowledgeCount} knowledge item{d.knowledgeCount === 1 ? "" : "s"})?</span>
                          <button
                            onClick={() => { const fd = new FormData(); fd.set("id", d.id); call(deleteDocument, fd, `"${d.title}" deleted.`); }}
                            disabled={busy}
                            className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/30"
                          >
                            Yes, delete
                          </button>
                          <button onClick={() => setConfirmId(null)} className="btn-ghost !py-1.5 text-xs">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmId(d.id)} className="ml-auto rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {docs.length === 0 && <p className="muted">Nothing captured yet.</p>}
      </div>
    </section>
  );
}
