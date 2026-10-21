"use client";

import { useState, useTransition } from "react";
import { markRead } from "../capture/manage-actions";

export type ReadingItem = {
  id: string;
  employee: string;
  documentTitle: string;
  note: string | null;
  assignedAt: string;
};

/** Outstanding re-reads assigned after a policy/SOP update. Managers mark
 *  them complete inline; Members see the queue read-only. */
export default function ReadingQueue({ items, canMark }: { items: ReadingItem[]; canMark: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="muted text-sm">Queue clear — no outstanding re-reads.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((r) => {
        const isDone = done.has(r.id);
        return (
          <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-sm ${isDone ? "opacity-45" : ""}`}>
            <span className="font-medium text-navy-100">{r.employee}</span>
            <span className="text-xs text-navy-300">›</span>
            <span className="text-navy-100">{r.documentTitle}</span>
            {r.note && <span className="truncate text-xs text-amber-300/80" title={r.note}>{r.note}</span>}
            <span className="text-xs text-navy-300/60">{new Date(r.assignedAt).toLocaleDateString()}</span>
            {canMark && !isDone && (
              <button
                className="btn-ghost ms-auto !px-2.5 !py-1 text-xs"
                disabled={busyId === r.id}
                onClick={() => {
                  setBusyId(r.id);
                  startTransition(async () => {
                    const res = await markRead(r.id);
                    setBusyId(null);
                    if (res.ok) setDone((prev) => new Set(prev).add(r.id));
                  });
                }}
              >
                {busyId === r.id ? "…" : "Mark read ✓"}
              </button>
            )}
            {(!canMark || isDone) && (
              <span className="ms-auto text-xs text-navy-300/60">{isDone ? "read ✓" : "read-only"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
