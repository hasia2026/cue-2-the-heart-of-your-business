"use client";

import { useState } from "react";
import { releaseDraftInvoice } from "./service-actions";

type Props = {
  invoiceId: string;
  draftNumber: string;
  /** Amount on the draft at render time (owner can correct here). */
  amount: number;
};

/**
 * Review-and-release control for one DRAFT invoice. The owner can correct
 * the amount, then one confirm flips DRAFT → SENT with an audit entry. No
 * customer message is sent here — AR follow-up lives in the reminder flow.
 */
export default function DraftRelease({ invoiceId, draftNumber, amount }: Props) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(String(amount));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [released, setReleased] = useState(false);
  const parsed = Number(amt.replace(/[$,]/g, ""));
  const valid = Number.isFinite(parsed) && parsed >= 0;

  if (released) return <span className="text-xs text-emerald-300">Draft {draftNumber} released as SENT — see overdue reminders for follow-up.</span>;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost !py-1 !px-2.5 text-xs">
        Review &amp; send draft {draftNumber}
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-xs">
      <div className="font-semibold text-navy-100">Draft {draftNumber}</div>
      <p className="muted mt-0.5">
        Review the amount, then release it as SENT. This stamps the record — nothing is emailed to the customer;
        unpaid SENT invoices enter the reminder cadence in their language.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`amt-${invoiceId}`}>Invoice amount</label>
        <input
          id={`amt-${invoiceId}`}
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          inputMode="decimal"
          className="input !w-32 !py-1"
        />
        <button
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await releaseDraftInvoice(invoiceId, parsed);
            setBusy(false);
            if (r.ok) setReleased(true);
            else setMsg(r.error ?? "Something went wrong");
          }}
          disabled={busy || !valid}
          className="btn-primary !py-1 !px-2.5"
        >
          {busy ? "Releasing…" : "Release as sent"}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn-ghost !py-1 !px-2.5 text-xs">
          Cancel
        </button>
      </div>
      {msg && <p className="mt-1.5 text-red-300">{msg}</p>}
    </div>
  );
}
