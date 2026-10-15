"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMockAppraisal, type MockHints } from "./actions";

type Sheet = {
  sheetId: string;
  stock: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  odometer: number;
  allowance: number;
  recon: number;
  listPrice: number;
};

/** The mock lot sheet the user reads. Deterministic — its numbers are the
 *  answer key; rendering happens only here, values are validated server-side. */
function SheetText(s: Sheet) {
  return [
    "LANTANA TRADE DESK — inbound lot sheet (MOCK)",
    `Sheet: ${s.sheetId} · Received: this week · Units on sheet: 1`,
    "",
    `Stock: ${s.stock}  VIN: (mock — ends 0993)`,
    `Unit: ${s.year} Ford ${s.model} ${s.trim}`,
    "Odometer: 74,380 mi   Title: CLEAN",
    "",
    "Trade-in allowance (negotiated, becomes unit cost): $31,200",
    "Reconditioning estimate (total): $1,860",
    "  - front brake pads and rotors",
    "  - 4-wheel alignment",
    "  - interior detail + windshield chip fill",
    "Buyer notes: front bumper scuff, needs seat cover swap before listing",
    "",
    "Recommended target list price: $36,900",
  ].join("\n");
}

export default function MockExercise({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [hints, setHints] = useState<MockHints | null>(null);
  const [stock, setStock] = useState("");

  function downloadSheet() {
    const blob = new Blob([SheetText(sheet)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lantana-lot-sheet-${sheet.sheetId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitMockAppraisal(fd);
      if (res.ok) {
        setHints(null);
        setStock(res.stock ?? "MOCK-MT-7721");
        router.refresh();
        return;
      }
      setHints(res.hints ?? {});
    });
  }

  const input = "input";
  const errLabel = "text-xs text-red-300";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* The sheet — the "source export" */}
      <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="badge badge-orange">Source sheet</span>
          <button type="button" onClick={downloadSheet} className="btn-ghost ms-auto !px-3 !py-1 text-xs">
            Download .txt
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-amber-100">{SheetText(sheet)}</pre>
      </div>

      {/* Transcription form */}
      <form onSubmit={onSubmit} className="grid gap-3 self-start">
        <div>
          <label className="label" htmlFor="m-stock">Stock number</label>
          <input id="m-stock" name="stock" className={input} placeholder="e.g. MT-1234" autoComplete="off" />
          {hints?.stock && <p className={errLabel}>{hints.stock}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="m-year">Year</label>
            <input id="m-year" name="year" inputMode="numeric" className={input} placeholder="e.g. 2021" autoComplete="off" />
            {hints?.year && <p className={errLabel}>{hints.year}</p>}
          </div>
          <div>
            <label className="label" htmlFor="m-make">Make</label>
            <input id="m-make" name="make" className={input} placeholder="e.g. Toyota" autoComplete="off" />
            {hints?.make && <p className={errLabel}>{hints.make}</p>}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="m-allowance">Trade-in allowance ($)</label>
            <input id="m-allowance" name="allowance" inputMode="decimal" className={input} placeholder="e.g. $12,000" autoComplete="off" />
            {hints?.allowance && <p className={errLabel}>{hints.allowance}</p>}
          </div>
          <div>
            <label className="label" htmlFor="m-recon">Recon estimate ($)</label>
            <input id="m-recon" name="recon" inputMode="decimal" className={input} placeholder="e.g. $1,200" autoComplete="off" />
            {hints?.recon && <p className={errLabel}>{hints.recon}</p>}
          </div>
          <div>
            <label className="label" htmlFor="m-list">Target list ($)</label>
            <input id="m-list" name="listPrice" inputMode="decimal" className={input} placeholder="e.g. $29,900" autoComplete="off" />
            {hints?.listPrice && <p className={errLabel}>{hints.listPrice}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-flow">What should a trade-in appraisal become in CUE?</label>
          <select id="m-flow" name="flow" className={input} defaultValue="">
            <option value="">Choose…</option>
            <option value="photo">A photo note in a folder — I'll find it later</option>
            <option value="record">A structured vehicle record CUE can query</option>
            <option value="email">An email to the appraiser for a second opinion</option>
          </select>
          {hints?.flow && <p className={errLabel}>{hints.flow}</p>}
        </div>
        <button className="btn-primary w-fit" disabled={busy}>{busy ? "Checking…" : "Submit the appraisal"}</button>
        {hints && Object.keys(hints).length > 0 && (
          <p className="text-xs text-amber-200">
            {Object.keys(hints).length} field{Object.keys(hints).length > 1 ? "s need" : " needs"} a second look — check the
            hints above. The sheet is the ground truth, exactly like a real export.
          </p>
        )}
        {stock && (
          <p className="text-xs text-emerald-200">✓ {stock} created — scavenger hunt complete.</p>
        )}
      </form>
    </div>
  );
}
