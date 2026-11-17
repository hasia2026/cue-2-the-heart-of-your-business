"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMockServiceCall, type HvacMockHints } from "./actions";

type Sheet = {
  sheetId: string;
  job: string;
  customer: string;
  site: string;
  system: string;
  equipment: number;
  laborHours: number;
  permit: number;
  quoted: number;
  overhead: number;
};

/** The mock work order the user reads. Deterministic — its numbers are the
 *  answer key; rendering happens only here, values are validated server-side. */
function SheetText(s: Sheet) {
  return [
    "SUMMIT FIELD DESK — install work order (MOCK)",
    `Sheet: ${s.sheetId} · Received: this week · Jobs on sheet: 1`,
    "",
    `Job: ${s.job}  Customer: ${s.customer}`,
    `Site: ${s.site}`,
    `System: ${s.system}`,
    "",
    `Equipment cost (condenser + coil + furnace): $${s.equipment.toLocaleString()}`,
    `Labor: ${s.laborHours} hours at $145/hr (install crew of two)`,
    `Permit + haul-away: $${s.permit.toLocaleString()}`,
    `Overhead & margin: $${s.overhead.toLocaleString()}`,
    "",
    `Quoted total to customer: $${s.quoted.toLocaleString()}`,
    "Buyer notes: replace roof curb, reuse existing line set, register warranty same day",
  ].join("\n");
}

export default function HvacMockExercise({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [hints, setHints] = useState<HvacMockHints | null>(null);
  const [job, setJob] = useState("");

  function downloadSheet() {
    const blob = new Blob([SheetText(sheet)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `summit-work-order-${sheet.sheetId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitMockServiceCall(fd);
      if (res.ok) {
        setHints(null);
        setJob(res.job ?? "MOCK-SC-8842");
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
          <label className="label" htmlFor="h-job">Job number</label>
          <input id="h-job" name="job" className={input} placeholder="e.g. SC-1234" autoComplete="off" />
          {hints?.job && <p className={errLabel}>{hints.job}</p>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="h-equipment">Equipment cost ($)</label>
            <input id="h-equipment" name="equipment" inputMode="decimal" className={input} placeholder="e.g. $3,800" autoComplete="off" />
            {hints?.equipment && <p className={errLabel}>{hints.equipment}</p>}
          </div>
          <div>
            <label className="label" htmlFor="h-labor">Labor hours</label>
            <input id="h-labor" name="laborHours" inputMode="decimal" className={input} placeholder="e.g. 8" autoComplete="off" />
            {hints?.laborHours && <p className={errLabel}>{hints.laborHours}</p>}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="h-permit">Permit + haul-away ($)</label>
            <input id="h-permit" name="permit" inputMode="decimal" className={input} placeholder="e.g. $250" autoComplete="off" />
            {hints?.permit && <p className={errLabel}>{hints.permit}</p>}
          </div>
          <div>
            <label className="label" htmlFor="h-quoted">Quoted total ($)</label>
            <input id="h-quoted" name="quoted" inputMode="decimal" className={input} placeholder="e.g. $8,100" autoComplete="off" />
            {hints?.quoted && <p className={errLabel}>{hints.quoted}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="h-flow">What should a completed install work order become in CUE?</label>
          <select id="h-flow" name="flow" className={input} defaultValue="">
            <option value="">Choose…</option>
            <option value="photo">A photo note in a folder — I'll find it later</option>
            <option value="record">A structured service call CUE can query</option>
            <option value="email">An email to the installer for a second opinion</option>
          </select>
          {hints?.flow && <p className={errLabel}>{hints.flow}</p>}
        </div>
        <button className="btn-primary w-fit" disabled={busy}>{busy ? "Checking…" : "Submit the work order"}</button>
        {hints && Object.keys(hints).length > 0 && (
          <p className="text-xs text-amber-200">
            {Object.keys(hints).length} field{Object.keys(hints).length > 1 ? "s need" : " needs"} a second look — check the
            hints above. The sheet is the ground truth, exactly like a real export.
          </p>
        )}
        {job && (
          <p className="text-xs text-emerald-200">✓ {job} created — scavenger hunt complete.</p>
        )}
      </form>
    </div>
  );
}
