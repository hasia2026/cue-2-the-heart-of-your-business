"use client";

import { useMemo, useState, useTransition } from "react";
import { saveShifts } from "./shift-actions";
import { nextShift } from "./shift-shared";

export type Employee = { id: string; name: string; title: string };
export type Cell = { employeeId: string; day: number; shift: ShiftValue };

type ShiftValue = "AM" | "PM" | "DOUBLE" | "OFF";

const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

const CELL_STYLE: Record<ShiftValue, string> = {
  AM: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  PM: "bg-violet-500/15 text-violet-200 border-violet-500/30",
  DOUBLE: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  OFF: "bg-transparent text-navy-300/60 border-white/[0.06]",
};

/** Weekly roster grid: click a cell to cycle AM → PM → Double → Off, then
 *  save once. Read-only for Members. */
export default function ShiftGrid({
  employees,
  initial,
  canEdit,
}: {
  employees: Employee[];
  initial: Cell[];
  canEdit: boolean;
}) {
  const [cells, setCells] = useState<Record<string, ShiftValue>>(() =>
    Object.fromEntries(initial.map((c) => [`${c.employeeId}:${c.day}`, c.shift]))
  );
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (employeeId: string, day: number, value: ShiftValue) => {
    if (!canEdit) return;
    setCells((prev) => ({ ...prev, [`${employeeId}:${day}`]: value }));
    setDirty(true);
    setMsg(null);
  };

  const changed = useMemo(() => {
    const orig = new Map(initial.map((c) => [`${c.employeeId}:${c.day}`, c.shift]));
    return Object.entries(cells).flatMap(([key, shift]) => {
      if (orig.get(key) !== shift) {
        const [employeeId, day] = key.split(":");
        return [{ employeeId, day: Number(day), shift }];
      }
      return [];
    });
  }, [cells, initial]);

  const save = () =>
    startTransition(async () => {
      const res = await saveShifts(changed);
      if (res.ok) {
        setDirty(false);
        setMsg(`Saved ${changed.length} change${changed.length === 1 ? "" : "s"} ✓`);
      } else setMsg(res.error ?? "Save failed");
    });

  // Per-row summary: days worked + doubles for the visible week.
  const summary = (employeeId: string) => {
    let on = 0;
    let doubles = 0;
    for (const d of DAYS) {
      const s = cells[`${employeeId}:${d.dow}`] ?? "OFF";
      if (s !== "OFF") on += 1;
      if (s === "DOUBLE") doubles += 1;
    }
    return `${on} days${doubles ? ` · ${doubles} double${doubles === 1 ? "" : "s"}` : ""}`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-56 text-start font-medium text-navy-300">Employee</th>
            {DAYS.map((d) => (
              <th key={d.dow} className="h-7 font-medium text-navy-300">{d.label}</th>
            ))}
            <th className="w-32 text-start font-medium text-navy-300">Week</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-1 font-medium text-navy-100">
                {e.name}
                <span className="ms-1.5 text-navy-300/70">{e.title}</span>
              </td>
              {DAYS.map((d) => {
                const s = (cells[`${e.id}:${d.dow}`] ?? "OFF") as ShiftValue;
                return (
                  <td key={d.dow} className="p-0">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set(e.id, d.dow, nextShift(s))}
                      className={`h-8 w-full rounded-lg border text-[11px] font-medium transition ${CELL_STYLE[s]} ${canEdit ? "cursor-pointer hover:outline hover:outline-1 hover:outline-white/25" : "cursor-default"}`}
                    >
                      {s === "DOUBLE" ? "DBL" : s === "OFF" ? "—" : s}
                    </button>
                  </td>
                );
              })}
              <td className="whitespace-nowrap px-1 text-[11px] text-navy-300/80">{summary(e.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-3">
        {canEdit && employees.length > 0 ? (
          <>
            <button
              onClick={save}
              disabled={!dirty || pending}
              className="btn-primary text-xs"
            >
              {pending ? "Saving…" : dirty ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes"}
            </button>
            {msg && <span className="text-xs text-navy-300">{msg}</span>}
            {!dirty && !msg && <span className="text-xs text-navy-300/60">Click a shift to cycle AM → PM → DBL → off.</span>}
          </>
        ) : (
          <span className="text-xs text-navy-300/60">
            {employees.length > 0 ? "Read-only — owners, admins and managers edit the roster." : "No employees yet."}
          </span>
        )}
      </div>
    </div>
  );
}
