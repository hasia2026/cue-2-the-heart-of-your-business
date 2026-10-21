"use client";

import { useState } from "react";
import {
  renameDocument,
  moveDocument,
  editDocumentText,
  deleteDocument,
  shareDocument,
  revokeShare,
  assignReRead,
} from "./manage-actions";

type Dept = { id: string; name: string };

export default function DocumentRow({
  doc,
  canManage,
  departments,
  currentDept,
  hasShare,
}: {
  doc: { id: string; title: string; kind: string; status: string; uploaded_at: string; size_bytes: number; knowledge_count: number; re_read_outstanding: number; extracted_text: string | null };
  canManage: boolean;
  departments: Dept[];
  currentDept: string | null;
  hasShare: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(hasShare ? "active" : null);
  const [title, setTitle] = useState(doc.title);
  const [text, setText] = useState(doc.extracted_text ?? "");
  const [dept, setDept] = useState(currentDept ?? "");
  const [rrScope, setRrScope] = useState("ALL");
  const [rrNote, setRrNote] = useState("");
  const [rrMsg, setRrMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; url?: string; assigned?: number }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      return res;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge-blue">{doc.kind}</span>
        <span className="font-medium text-navy-100">{doc.title}</span>
        <span className="text-xs text-navy-300/60">
          {new Date(doc.uploaded_at).toLocaleDateString()} · {Math.max(1, Math.round(Number(doc.size_bytes) / 1024))} KB
          {currentDept ? ` · ${currentDept}` : ""}
        </span>
        {Number(doc.knowledge_count) > 0 && (
          <span className="badge-green ms-auto">{doc.knowledge_count} knowledge</span>
        )}
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Actions"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {shareUrl && shareUrl !== "active" && (
        <p className="mt-2 break-all rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-cue-blue">{shareUrl}</p>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
          {/* View */}
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-navy-300">View content</summary>
            <div className="mt-2 whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-xs text-navy-100">
              {doc.extracted_text || "No extracted content yet."}
            </div>
          </details>

          {canManage && (
            <>
              {/* Rename / edit content */}
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`t-${doc.id}`}>Title</label>
                  <div className="flex gap-1.5">
                    <input id={`t-${doc.id}`} value={title} onChange={(e) => setTitle(e.target.value)} className="input !py-1.5 text-xs" />
                    <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy}
                      onClick={() => run(() => renameDocument(doc.id, title))}>Save</button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`d-${doc.id}`}>Move to department</label>
                  <div className="flex gap-1.5">
                    <select id={`d-${doc.id}`} value={dept} onChange={(e) => setDept(e.target.value)} className="input !py-1.5 text-xs">
                      <option value="">Unfiled</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={busy}
                      onClick={() => run(() => moveDocument(doc.id, dept || null))}>Move</button>
                  </div>
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`x-${doc.id}`}>Edit content</label>
                <textarea id={`x-${doc.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} className="input !py-1.5 text-xs" />
                <button className="btn-ghost mt-1.5 !px-2.5 !py-1 text-xs" disabled={busy}
                  onClick={() => run(() => editDocumentText(doc.id, text))}>Save content</button>
              </div>

              {/* Re-read assignment — the update acknowledgment loop: pick a
                  scope, staff show up on People → Reading queue until read. */}
              <div className="rounded-lg border border-white/[0.06] p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-navy-300">Policy update — assign re-read</div>
                {Number(doc.re_read_outstanding) > 0 && (
                  <span className="badge-orange mt-1 inline-block">{doc.re_read_outstanding} outstanding</span>
                )}
                <div className="mt-2 grid gap-2 md:grid-cols-[auto,1fr,auto]">
                  <select aria-label="Re-read audience" value={rrScope} onChange={(e) => setRrScope(e.target.value)} className="input !py-1.5 text-xs">
                    <option value="ALL">Everyone (active)</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}
                  </select>
                  <input
                    aria-label="Re-read note"
                    value={rrNote}
                    onChange={(e) => setRrNote(e.target.value)}
                    placeholder="What changed, in one line (optional)"
                    className="input !py-1.5 text-xs"
                    maxLength={500}
                  />
                  <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy}
                    onClick={async () => {
                      const r = await run(() => assignReRead(doc.id, rrScope, rrNote));
                      if (r.ok) { setRrMsg(`Assigned to ${r.assigned ?? 0} ✓`); setRrNote(""); }
                    }}>
                    Assign re-read
                  </button>
                </div>
                {rrMsg && <p className="mt-1.5 text-xs text-emerald-300">{rrMsg}</p>}
              </div>

              {/* Delete */}
              <button className="btn-danger !px-3 !py-1.5 text-xs" disabled={busy}
                onClick={() => { if (confirm(`Delete "${doc.title}"? Knowledge built from it stays, but the source link is removed.`)) run(() => deleteDocument(doc.id)); }}>
                Delete document
              </button>
            </>
          )}

          {/* Share — available to every role */}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={busy}
              onClick={async () => { const r = await run(() => shareDocument(doc.id, 7)); if (r.ok && r.url) setShareUrl(r.url); }}>
              {shareUrl ? "New share link (7 days)" : "Share link (7 days)"}
            </button>
            {shareUrl && (
              <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={busy}
                onClick={async () => { const r = await run(() => revokeShare(doc.id)); if (r.ok) setShareUrl(null); }}>
                Revoke share
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
