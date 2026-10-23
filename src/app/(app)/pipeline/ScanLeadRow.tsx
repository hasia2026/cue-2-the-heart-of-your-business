"use client";

import { useState } from "react";

type Props = {
  leadId: string;
  status: string;
  note: string | null;
  canEdit: boolean;
};

const OPTIONS = [
  { v: "NEW", label: "New" },
  { v: "CALLED", label: "Called — no answer" },
  { v: "BOOKED", label: "Scan call booked" },
  { v: "NOT_INTERESTED", label: "Not interested" },
];

const statusClass: Record<string, string> = {
  NEW: "bg-orange-500/15 text-orange-300",
  CALLED: "bg-sky-500/15 text-sky-300",
  BOOKED: "bg-emerald-500/15 text-emerald-300",
  NOT_INTERESTED: "bg-white/[0.08] text-navy-300",
};

/** Inline status + follow-up notes for one scan lead. Optimistic status. */
export default function ScanLeadRow({ leadId, status, note, canEdit }: Props) {
  const [st, setSt] = useState(status);
  const [busy, setBusy] = useState(false);
  const [showNote, setShowNote] = useState(!!note);
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [savedNote, setSavedNote] = useState(note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = draftNote !== savedNote;

  async function changeStatus(v: string) {
    const prev = st;
    setSt(v);
    setBusy(true);
    const { setScanLeadStatus } = await import("./scan-lead-actions");
    const r = await setScanLeadStatus(leadId, v);
    setBusy(false);
    if (!r.ok) {
      setSt(prev);
      setMsg(r.error ?? "Something went wrong");
    } else {
      setMsg(null);
    }
  }

  async function saveNote() {
    setBusy(true);
    const { saveScanLeadNote } = await import("./scan-lead-actions");
    const r = await saveScanLeadNote(leadId, draftNote);
    setBusy(false);
    if (r.ok) {
      setSavedNote(draftNote);
      setMsg(null);
    } else {
      setMsg(r.error ?? "Something went wrong");
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      {canEdit ? (
        <select
          value={st}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value)}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass[st] ?? "bg-white/[0.08] text-navy-300"}`}
          aria-label="Call status"
        >
          {OPTIONS.map((o) => (
            <option key={o.v} value={o.v} className="text-black">
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass[st] ?? ""}`}>{st}</span>
      )}
      {canEdit &&
        (showNote ? (
          <>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Follow-up notes — what was discussed, next step…"
              className="input w-full !py-1.5"
              aria-label="Follow-up note"
            />
            <button onClick={saveNote} disabled={busy || !dirty} className="btn-primary !py-1 !px-2.5">
              {busy ? "Saving…" : dirty ? "Save notes" : "Saved"}
            </button>
          </>
        ) : (
          <button onClick={() => setShowNote(true)} className="btn-ghost !py-1 !px-2.5">
            + Add notes
          </button>
        ))}
      {msg && <span className="text-red-300">{msg}</span>}
    </div>
  );
}
