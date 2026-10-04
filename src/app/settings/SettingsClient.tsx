"use client";

import { useState, useTransition } from "react";
import { setAiPermissions } from "./actions";

const LEVELS = [
  { key: "observe", label: "Observe", desc: "CUE can analyze information and compute health, patterns and insights." },
  { key: "recommend", label: "Recommend", desc: "CUE can propose actions — always with evidence and a human decision point." },
  { key: "prepare", label: "Prepare", desc: "CUE can draft workflows, tasks and content for your review before anything is live." },
  { key: "execute", label: "Execute", desc: "CUE can carry out approved actions (creating workflows from decisions you made)." },
  { key: "automate", label: "Automate", desc: "CUE can run predefined workflows on explicit rules, without asking each time." },
] as const;

type Key = (typeof LEVELS)[number]["key"];

export default function SettingsClient({ ai }: { ai: Record<Key, boolean> }) {
  const [state, setState] = useState(ai);
  const [pending, start] = useTransition();

  function toggle(key: Key) {
    const next = { ...state, [key]: !state[key] };
    // Enforce dependency: automate requires execute; execute requires prepare
    if (key === "prepare" && !next.prepare) {
      next.execute = false;
      next.automate = false;
    }
    if (key === "execute" && !next.execute) next.automate = false;
    if (key === "execute" && next.execute) next.prepare = true;
    if (key === "automate" && next.automate) next.execute = true;

    setState(next);
    start(() => {
      void setAiPermissions(next);
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="section-title">AI permissions</h2>
        {pending && <span className="text-xs text-navy-400">Saving…</span>}
      </div>
      <p className="muted mb-4">
        CUE is designed around human control. Consequential actions never happen silently — these switches control how far the AI may go on its own.
      </p>
      <div className="space-y-2.5">
        {LEVELS.map((l) => {
          const disabled =
            (l.key === "automate" && !state.execute) ||
            (l.key === "execute" && !state.prepare) ||
            (l.key === "recommend" && !state.observe);
          return (
            <label
              key={l.key}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
                state[l.key] ? "border-blue-500/40 bg-blue-500/10" : "border-navy-100"
              } ${disabled ? "opacity-50" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={state[l.key]}
                onChange={() => toggle(l.key)}
                disabled={disabled || pending}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-navy-900">{l.label}</div>
                <div className="text-xs text-navy-500">{l.desc}</div>
              </div>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-navy-400">
        Defaults: Observe + Recommend + Prepare on; Execute and Automate off — CUE stays in the loop until you explicitly grant more autonomy. Every change is audit-logged.
      </p>
    </section>
  );
}
