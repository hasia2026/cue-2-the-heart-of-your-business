"use client";

import { useState } from "react";
import type { ImportKind } from "@/lib/csv";

// Tiny download trigger for the reconciliation export next to each Recent
// imports row. The server action builds the CSV org-scoped from the session;
// this component only blobs it to disk.
export default function ExportBtn({ kind, label }: { kind: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { exportReconciliationAction } = await import("./actions");
      const { fileName, csv } = await exportReconciliationAction(kind as ImportKind);
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

  return (
    <button
      type="button"
      aria-busy={busy}
      className={`btn-ghost !px-2 !py-0.5 text-[11px] ${busy ? "animate-pulse" : ""} ${failed ? "!text-red-300" : ""}`}
      disabled={busy}
      onClick={() => void download()}
      title={failed ? "Download failed — try again" : `Download every ${kind.toLowerCase()} record as a CSV reconciliation copy — large record sets take a moment`}
    >
      {failed ? "retry ↓" : busy ? "writing…" : label}
    </button>
  );
}
