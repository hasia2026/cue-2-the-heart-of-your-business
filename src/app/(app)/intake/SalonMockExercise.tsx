"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMockSalonTicket, type SalonMockHints } from "./actions";

type Sheet = {
  sheetId: string; ticket: string; client: string; service: string;
  servicePrice: number; retailName: string; retailPrice: number;
  rebookWeeks: number; total: number;
};

function SheetText(s: Sheet) {
  return [
    "LOTUS NAIL STUDIO — service ticket (MOCK)",
    `Sheet: ${s.sheetId} · Written: this week · Tickets on sheet: 1`,
    "",
    `Ticket: ${s.ticket}  Client: ${s.client}`,
    `Service: ${s.service} — $${s.servicePrice.toLocaleString()}`,
    `Retail: ${s.retailName} — $${s.retailPrice.toLocaleString()}`,
    `Ticket total: $${s.total.toLocaleString()}`,
    "",
    `Rebook: ${s.rebookWeeks} weeks (gel cycle)`,
    "Front desk note: client prefers a Vietnamese confirmation text",
  ].join("\n");
}

export default function SalonMockExercise({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [hints, setHints] = useState<SalonMockHints | null>(null);
  const [ticket, setTicket] = useState("");

  function downloadSheet() {
    const blob = new Blob([SheetText(sheet)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lotus-service-ticket-${sheet.sheetId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitMockSalonTicket(fd);
      if (res.ok) {
        setHints(null);
        setTicket(res.ticket ?? "MOCK-ST-2291");
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
          <label className="label" htmlFor="s-ticket">Ticket number</label>
          <input id="s-ticket" name="ticket" className="input" placeholder="e.g. 2291" autoComplete="off" />
          {hints?.ticket && <p className={errLabel}>{hints.ticket}</p>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-service">Service price ($)</label>
            <input id="s-service" name="servicePrice" inputMode="decimal" className="input" placeholder="e.g. $68" autoComplete="off" />
            {hints?.servicePrice && <p className={errLabel}>{hints.servicePrice}</p>}
          </div>
          <div>
            <label className="label" htmlFor="s-retail">Retail price ($)</label>
            <input id="s-retail" name="retailPrice" inputMode="decimal" className="input" placeholder="e.g. $12" autoComplete="off" />
            {hints?.retailPrice && <p className={errLabel}>{hints.retailPrice}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="s-rebook">Rebook in (weeks)</label>
          <input id="s-rebook" name="rebookWeeks" inputMode="numeric" className="input" placeholder="e.g. 3" autoComplete="off" />
          {hints?.rebookWeeks && <p className={errLabel}>{hints.rebookWeeks}</p>}
        </div>
        <div>
          <label className="label" htmlFor="s-flow">What should a closed service ticket become in CUE?</label>
          <select id="s-flow" name="flow" className="input" defaultValue="">
            <option value="">Choose…</option>
            <option value="photo">A photo note in a folder — I'll find it later</option>
            <option value="record">A structured service ticket with the next appointment booked</option>
            <option value="email">An email to the tech for a second opinion</option>
          </select>
          {hints?.flow && <p className={errLabel}>{hints.flow}</p>}
        </div>
        <button className="btn-primary w-fit" disabled={busy}>{busy ? "Checking…" : "Submit the service ticket"}</button>
        {hints && Object.keys(hints).length > 0 && (
          <p className="text-xs text-amber-200">
            {Object.keys(hints).length} field{Object.keys(hints).length > 1 ? "s need" : " needs"} a second look — check the hints above.
          </p>
        )}
        {ticket && <p className="text-xs text-emerald-200">✓ {ticket} created — rebooking on the books.</p>}
      </form>
    </div>
  );
}
