"use client";

import { useState, useTransition } from "react";
import { completeVisit, noShowVisit } from "./visit-actions";

/** Per-visit action buttons for the Upcoming appointments board. Lets the
 *  tech/office close out today's visit without touching the follow-up. */
export default function VisitActions({
  apptId,
  status,
  canEdit,
}: {
  apptId: string;
  status: string;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!canEdit) return null;
  const actionable = status === "SCHEDULED" && !done;

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn(apptId);
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else setDone(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actionable ? (
        <>
          <button
            className="btn-ghost !px-2.5 !py-1 text-xs"
            disabled={pending}
            onClick={() => run(completeVisit)}
          >
            {pending ? "…" : "Done today"}
          </button>
          <button
            className="btn-ghost !px-2.5 !py-1 text-xs"
            disabled={pending}
            onClick={() => run(noShowVisit)}
          >
            No-show
          </button>
        </>
      ) : (
        <span className="badge-green text-xs">{done ? "completed ✓" : status.toLowerCase()}</span>
      )}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
