"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { addJobOrEstimate } from "./job-actions";

type Customer = { id: string; name: string; address: string | null };

function SubmitBtn({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending || !ready}>
      {pending ? "Adding…" : "Add job / estimate"}
    </button>
  );
}

export default function NewJobForm({ customers, suggestions }: { customers: Customer[]; suggestions: string[] }) {
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const customer = customers.find((c) => c.id === customerId);

  async function onSubmit(formData: FormData) {
    setState(null);
    const res = await addJobOrEstimate(formData);
    if (res.ok) {
      setState({ ok: true, msg: `“${String(formData.get("title"))}” added to Pipeline and ready to be scheduled, quoted, and billed.` });
    } else {
      setState({ ok: false, msg: res.error ?? "Something went wrong." });
    }
  }

  return (
    <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="label" htmlFor="nj-customer">Existing customer</label>
        <select id="nj-customer" name="customerId" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.address ? ` — ${c.address}` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="nj-title">Job / estimate name</label>
        <input id="nj-title" name="title" className="input" placeholder="e.g. 2nd floor heat pump replacement" required />
      </div>
      <div>
        <label className="label" htmlFor="nj-amount">Job value ($)</label>
        <input id="nj-amount" name="amount" className="input" inputMode="decimal" placeholder="7100" required />
      </div>
      <div>
        <label className="label" htmlFor="nj-serviceType">Job type (optional)</label>
        <input id="nj-serviceType" name="serviceType" className="input" list="nj-types" placeholder="Diagnostic, Installation, Maintenance…" />
        <datalist id="nj-types">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="nj-address">Property address for this job</label>
        <input id="nj-address" name="address" className="input" placeholder={customer?.address ? `e.g. ${customer.address}` : "Street, city, state, ZIP"} />
        <p className="muted mt-1 text-xs">Saved to THIS job, so history can be filtered by property. A customer with many locations keeps them all — nothing is overwritten.</p>
      </div>
      <div>
        <label className="label" htmlFor="nj-area">Area / town (optional)</label>
        <input id="nj-area" name="area" className="input" placeholder="Maple Heights" />
      </div>
      <div>
        <label className="label" htmlFor="nj-when">Schedule a visit (optional)</label>
        <input id="nj-when" name="when" type="datetime-local" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="nj-apptKind">Visit type</label>
        <select id="nj-apptKind" name="apptKind" className="input" defaultValue="SERVICE">
          <option value="SERVICE">Service</option>
          <option value="MEETING">Meet / walk-through</option>
          <option value="DELIVERY">Delivery</option>
          <option value="TEST_DRIVE">Test drive</option>
        </select>
      </div>
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <SubmitBtn ready={Boolean(customerId)} />
        {state && <span className={`text-xs ${state.ok ? "text-emerald-300" : "text-red-400"}`}>{state.msg}</span>}
      </div>
    </form>
  );
}
