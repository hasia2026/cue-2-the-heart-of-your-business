"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMockRepairOrder, type RepairMockHints } from "./actions";

type Sheet = {
  sheetId: string; ro: string; customer: string; vehicle: string;
  mileage: number; concern: string; parts: number; laborHours: number; quoted: number;
};

function SheetText(s: Sheet) {
  return [
    "HARBOR AUTO REPAIR — repair order (MOCK)",
    `Sheet: ${s.sheetId} · Written: this week · Orders on sheet: 1`,
    "",
    `RO: ${s.ro}  Customer: ${s.customer}`,
    `Vehicle: ${s.vehicle}  Mileage: ${s.mileage.toLocaleString()}`,
    `Concern: ${s.concern}`,
    "",
    `Parts (pads, rotors, hardware): $${s.parts.toLocaleString()}`,
    `Labor: ${s.laborHours} hours at $135/hr`,
    `Shop supplies & tax: included`,
    "",
    `Quoted total to customer: $${s.quoted.toLocaleString()}`,
    "Tech notes: road test confirmed pulsation; front rotors below spec; rear brakes at 6mm",
  ].join("\n");
}

export default function RepairMockExercise({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [hints, setHints] = useState<RepairMockHints | null>(null);
  const [ro, setRo] = useState("");

  function downloadSheet() {
    const blob = new Blob([SheetText(sheet)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `harbor-repair-order-${sheet.sheetId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitMockRepairOrder(fd);
      if (res.ok) {
        setHints(null);
        setRo(res.ro ?? "MOCK-RO-4417");
        router.refresh();
        return;
      }
      setHints(res.hints ?? {});
    });
  }

  const errLabel = "text-xs text-red-300";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="badge badge-orange">Source sheet</span>
          <button type="button" onClick={downloadSheet} className="btn-ghost ms-auto !px-3 !py-1 text-xs">
            Download .txt
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-amber-100">{SheetText(sheet)}</pre>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 self-start">
        <div>
          <label className="label" htmlFor="r-ro">Repair order number</label>
          <input id="r-ro" name="ro" className="input" placeholder="e.g. 4417" autoComplete="off" />
          {hints?.ro && <p className={errLabel}>{hints.ro}</p>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="r-parts">Parts cost ($)</label>
            <input id="r-parts" name="parts" inputMode="decimal" className="input" placeholder="e.g. $268" autoComplete="off" />
            {hints?.parts && <p className={errLabel}>{hints.parts}</p>}
          </div>
          <div>
            <label className="label" htmlFor="r-labor">Labor hours</label>
            <input id="r-labor" name="laborHours" inputMode="decimal" className="input" placeholder="e.g. 3.5" autoComplete="off" />
            {hints?.laborHours && <p className={errLabel}>{hints.laborHours}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="r-quoted">Quoted total ($)</label>
          <input id="r-quoted" name="quoted" inputMode="decimal" className="input" placeholder="e.g. $742" autoComplete="off" />
          {hints?.quoted && <p className={errLabel}>{hints.quoted}</p>}
        </div>
        <div>
          <label className="label" htmlFor="r-flow">What should a completed repair order become in CUE?</label>
          <select id="r-flow" name="flow" className="input" defaultValue="">
            <option value="">Choose…</option>
            <option value="photo">A photo note in a folder — I'll find it later</option>
            <option value="record">A structured repair order CUE can query</option>
            <option value="email">An email to the tech for a second opinion</option>
          </select>
          {hints?.flow && <p className={errLabel}>{hints.flow}</p>}
        </div>
        <button className="btn-primary w-fit" disabled={busy}>{busy ? "Checking…" : "Submit the repair order"}</button>
        {hints && Object.keys(hints).length > 0 && (
          <p className="text-xs text-amber-200">
            {Object.keys(hints).length} field{Object.keys(hints).length > 1 ? "s need" : " needs"} a second look — check the hints above.
          </p>
        )}
        {ro && <p className="text-xs text-emerald-200">✓ {ro} created — scavenger hunt complete.</p>}
      </form>
    </div>
  );
}
