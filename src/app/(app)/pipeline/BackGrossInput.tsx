"use client";

import { useState, useTransition } from "react";
import { setDealBackGross } from "./desking-actions";

/** Inline back-gross editor on a desking row. Shows the current F&I total;
 *  click to expose the field, save on blur when dirty. */
export default function BackGrossInput({
  dealId,
  value,
  canEdit,
}: {
  dealId: string;
  value: number;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [msg, setMsg] = useState<string | null>(null);

  if (!canEdit) return <span className="badge-purple">back ${value.toLocaleString()}</span>;

  if (!editing) {
    return (
      <button
        className="badge-purple cursor-pointer select-none"
        title="Click to set F&I / warranty / GAP gross"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
      >
        back ${value.toLocaleString()} ✎
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        aria-label="Back gross"
        value={draft}
        inputMode="decimal"
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.max(0, Math.round(Number(draft.replace(/[$,]/g, "")) || 0));
          if (n === value) { setEditing(false); return; }
          startTransition(async () => {
            const r = await setDealBackGross(dealId, n);
            if (!r.ok) { setMsg(r.error ?? "Failed"); return; }
            setEditing(false);
            setMsg("✓");
            setTimeout(() => setMsg(null), 1500);
          });
        }}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        className="input !px-2 !py-0.5 !w-20 text-xs text-end"
      />
      {pending && <span className="text-xs text-navy-300/60">…</span>}
      {msg && <span className="text-xs text-emerald-300">{msg}</span>}
    </span>
  );
}
