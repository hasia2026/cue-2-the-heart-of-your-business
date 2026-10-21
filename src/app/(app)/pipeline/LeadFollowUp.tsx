"use client";

import { useState, useTransition } from "react";
import { setLeadNextAction, logLeadContact } from "./lead-actions";

type Props = {
  leadId: string;
  /** ISO date string or null — the current next-action deadline. */
  nextActionAt: string | null;
  /** Seconds past epoch the lead was last contacted (for "today" default). */
  lastContactedAgoDays: number;
  canEdit: boolean;
};

/** Per-lead follow-up tracker: shows the days-until/overdue counter, lets an
 *  owner set the next contact date, and logs the contact when it happens. */
export default function LeadFollowUp({ leadId, nextActionAt, lastContactedAgoDays, canEdit }: Props) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(nextActionAt ? nextActionAt.slice(0, 10) : defaultDate(lastContactedAgoDays));
  const [error, setError] = useState<string | null>(null);

  function defaultDate(agoDays: number) {
    const d = new Date(Date.now() + (agoDays > 5 ? 0 : 3) * 864e5); // overdue → today, else 3 days out
    return d.toISOString().slice(0, 10);
  }

  if (!canEdit) return null;

  const overdue = nextActionAt && new Date(nextActionAt).getTime() < Date.now();
  const daysLeft = nextActionAt
    ? Math.round((new Date(nextActionAt).getTime() - Date.now()) / 864e5)
    : null;

  function save(next: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setLeadNextAction(leadId, next);
      if (!r.ok) setError(r.error ?? "Failed");
      else setEditing(false);
    });
  }

  function contact() {
    setError(null);
    startTransition(async () => {
      const r = await logLeadContact(leadId);
      if (!r.ok) setError(r.error ?? "Failed");
    });
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {nextActionAt ? (
        <span className={`badge text-xs ${overdue ? "badge-red" : daysLeft! <= 1 ? "badge-orange" : "badge-blue"}`}>
          {overdue ? `${Math.abs(daysLeft!)}d overdue` : `due in ${daysLeft}d`}
        </span>
      ) : (
        <span className="badge-low text-xs">no follow-up set</span>
      )}
      {editing ? (
        <>
          <input
            type="date"
            aria-label="Next follow-up date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input !py-1 text-xs"
          />
          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={pending} onClick={() => save(date)}>
            Save
          </button>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(true)}>
            {nextActionAt ? "Reschedule" : "+ Follow-up"}
          </button>
          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={pending} onClick={contact}>
            Contacted
          </button>
        </>
      )}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
