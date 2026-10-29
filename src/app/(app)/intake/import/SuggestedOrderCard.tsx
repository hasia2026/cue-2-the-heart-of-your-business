"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReviMark from "@/components/ReviMark";
import type { DismissedItem, SuggestedOrder, SuggestedOrderRow } from "@/lib/suggested-order";

// Revi's suggested order card — the rows are computed server-side at render;
// "Done" checks off a chase (dismiss) and the Restore strip brings one back.
// Both go through server actions in ./actions, which revalidate the page, so
// the dismissal is shared for the whole workspace. The download action can
// take a beat on large record sets, so the button shows an animated building
// state instead of sitting there looking dead.

const money = (n: number) => `$${n.toFixed(2)}`;

const CATEGORY_LABEL: Record<SuggestedOrderRow["category"], string> = {
  INVOICE_OVERDUE: "Overdue invoice",
  VEHICLE_IN_TRANSIT: "In transit",
  CONTACT_INFO: "Contact gap",
};

// The card renders the head of the list; the full worklist is the CSV.
const MAX_ROWS_SHOWN = 10;

export default function SuggestedOrderCard({
  ambassadorName,
  rows,
  summary,
  dismissed,
}: {
  ambassadorName: string;
  rows: SuggestedOrderRow[];
  summary: SuggestedOrder["summary"];
  dismissed: DismissedItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingRow, setPendingRow] = useState<string | null>(null); // `${category}:${record}` mid-dismiss
  const [pendingRestore, setPendingRestore] = useState<string | null>(null); // dismissed id mid-restore

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { suggestedOrderCsvAction } = await import("./actions");
      const { fileName, csv } = await suggestedOrderCsvAction();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(row: SuggestedOrderRow) {
    const key = `${row.category}:${row.record}`;
    setPendingRow(key);
    try {
      const { dismissSuggestedOrderAction } = await import("./actions");
      await dismissSuggestedOrderAction(row.category, row.record, row.detail);
      router.refresh();
    } finally {
      setPendingRow(null);
    }
  }

  async function restore(id: string) {
    setPendingRestore(id);
    try {
      const { restoreSuggestedOrderAction } = await import("./actions");
      await restoreSuggestedOrderAction(id);
      router.refresh();
    } finally {
      setPendingRestore(null);
    }
  }

  const shown = rows.slice(0, MAX_ROWS_SHOWN);
  const overflow = rows.length - shown.length;
  const lines: string[] = [];
  if (summary.invoices > 0) {
    lines.push(`${summary.invoices} overdue invoice${summary.invoices === 1 ? "" : "s"} — ${money(summary.invoiceTotal)} to collect`);
  }
  if (summary.vehicles > 0) {
    lines.push(`${summary.vehicles} vehicle${summary.vehicles === 1 ? "" : "s"} in transit — confirm arrival`);
  }
  if (summary.contact > 0) {
    lines.push(`${summary.contact} customer${summary.contact === 1 ? "" : "s"} missing an email or phone`);
  }

  return (
    <section className="rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <ReviMark className="h-5 w-5" />
        <h2 className="text-sm font-medium text-navy-100">{ambassadorName}&rsquo;s suggested order</h2>
      </div>
      {lines.length > 0 ? (
        <>
          <p className="muted mt-1 text-xs">
            What to chase next, written from your imported records — priority-ordered: money first, then deliveries, then data to collect.
            Check a row off once it’s handled and it drops off the card, the digest, and the worklist.
          </p>
          <ol className="mt-2 space-y-1.5 text-xs text-navy-100">
            {shown.map((r) => {
              const key = `${r.category}:${r.record}`;
              return (
                <li key={key} className="flex items-start gap-2">
                  <span aria-hidden className="muted mt-0.5 shrink-0 tabular-nums">{r.priority}.</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{r.record || r.customer}</span>
                    <span className="muted"> · {CATEGORY_LABEL[r.category]}</span>
                    <span className="muted"> · {r.detail}</span>
                    {r.customer && r.record && r.customer !== r.record && (
                      <span className="muted"> · {r.customer}</span>
                    )}
                    <span className="muted">{r.since ? ` · since ${r.since}` : ""}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn-ghost !px-2 !py-0.5 text-[11px] shrink-0 ${pendingRow === key ? "animate-pulse" : ""}`}
                    disabled={pendingRow === key}
                    onClick={() => void dismiss(r)}
                    title={`Chase done — hide “${r.record || r.customer}” from the order`}
                  >
                    {pendingRow === key ? "Saving…" : "✓ Done"}
                  </button>
                </li>
              );
            })}
          </ol>
          {overflow > 0 && (
            <p className="muted mt-1.5 text-xs">+ {overflow} more in the worklist download below.</p>
          )}
          {dismissed.length > 0 && (
            <div className="mt-3 rounded-lg border border-white/[0.06] p-2.5">
              <p className="muted text-[11px]">
                Chased: {dismissed.length} row{dismissed.length === 1 ? "" : "s"} checked off{dismissed.length > 1 ? " (showing the latest 8)" : ""}.
              </p>
              <ul className="mt-1 space-y-1 text-[11px] text-navy-100">
                {dismissed.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="line-through decoration-white/30">{d.record}</span>
                      {d.detail ? <span className="muted"> · {d.detail}</span> : null}
                      {d.actorName ? <span className="muted"> · by {d.actorName}</span> : null}
                    </span>
                    <button
                      type="button"
                      className={`btn-ghost !px-2 !py-0.5 text-[11px] shrink-0 ${pendingRestore === d.id ? "animate-pulse" : ""}`}
                      disabled={pendingRestore === d.id}
                      onClick={() => void restore(d.id)}
                      title={`Restore “${d.record}” — it wasn’t handled after all`}
                    >
                      {pendingRestore === d.id ? "Restoring…" : "↺ Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3">
            <button
              type="button"
              className={`btn-ghost !px-3 !py-1.5 text-xs ${busy ? "animate-pulse" : ""}`}
              disabled={busy}
              onClick={() => void download()}
              title="Download the order as a CSV worklist, one row per follow-up (checked-off rows are excluded)"
            >
              {failed ? "Retrying — download failed once" : busy ? "Writing the order…" : "Download order CSV ↓"}
            </button>
          </div>
        </>
      ) : (
        <p className="muted mt-1 text-xs">
          Nothing to chase right now — no overdue invoices, no stuck deliveries, and every customer you&apos;ve imported is reachable.
          {summary.invoices + summary.vehicles + summary.contact === 0 && dismissed.length > 0
            ? " Great week."
            : dismissed.length > 0
              ? " The rows you checked off are listed below."
              : ""}
        </p>
      )}
    </section>
  );
}
