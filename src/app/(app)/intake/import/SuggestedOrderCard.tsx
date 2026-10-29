"use client";

import { useState } from "react";
import ReviMark from "@/components/ReviMark";
import type { SuggestedOrder } from "@/lib/suggested-order";

// Revi's suggested order card — the counts are computed server-side at
// render; clicking downloads the CSV built by suggestedOrderCsvAction. While
// that action runs (large record sets can take a beat) the button shows an
// animated "building" state instead of sitting there looking dead.

const money = (n: number) => `$${n.toFixed(2)}`;

export default function SuggestedOrderCard({
  ambassadorName,
  summary,
}: {
  ambassadorName: string;
  summary: SuggestedOrder["summary"];
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const lines: string[] = [];
  if (summary.invoices > 0) {
    lines.push(`${summary.invoices} invoice${summary.invoices === 1 ? "" : "s"} past due — ${money(summary.invoiceTotal)} to collect`);
  }
  if (summary.vehicles > 0) {
    lines.push(`${summary.vehicles} vehicle${summary.vehicles === 1 ? "" : "s"} still in transit — confirm arrival`);
  }
  if (summary.contact > 0) {
    lines.push(`${summary.contact} customer${summary.contact === 1 ? "" : "s"} missing an email or phone — collect it while they're in`);
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
          </p>
          <ul className="mt-2 space-y-1 text-xs text-navy-100">
            {lines.map((l) => (
              <li key={l} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <button
              type="button"
              className={`btn-ghost !px-3 !py-1.5 text-xs ${busy ? "animate-pulse" : ""}`}
              disabled={busy}
              onClick={() => void download()}
              title="Download the order as a CSV worklist, one row per follow-up"
            >
              {failed ? "Retrying — download failed once" : busy ? "Writing the order…" : "Download order CSV ↓"}
            </button>
          </div>
        </>
      ) : (
        <p className="muted mt-1 text-xs">
          Nothing to chase right now — no overdue invoices, no stuck deliveries, and every customer you&apos;ve imported is reachable.
        </p>
      )}
    </section>
  );
}
