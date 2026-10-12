"use client";

import { useState } from "react";

type Customer = { id: string; name: string; email: string | null; preferred_locale: string | null };

const LOCALES = [
  { value: "", label: "Auto (customer's preference)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ar", label: "العربية" },
  { value: "vi", label: "Tiếng Việt" },
];

// Send a one-line-item ad-hoc quote in the resolved language. The response
// shows which language was actually used and why (override / customer pref /
// default) — the honest-mode pattern the rest of CUE follows.
export default function QuoteSender({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [title, setTitle] = useState("Replacement quote — 3-ton system");
  const [amount, setAmount] = useState("7100");
  const [locale, setLocale] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          title,
          items: [{ description: title, amount: Number(amount) || 0 }],
          ...(locale ? { locale } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? String(res.status));
      setState({ kind: "ok", msg: res.ok && j.langUsed ? `Sent in ${j.langUsed} (${j.localeSource})` : "Sent" });
    } catch (err) {
      setState({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="label" htmlFor="qs-customer">Customer</label>
        <select id="qs-customer" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.preferred_locale ? ` (${c.preferred_locale})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="qs-locale">Language</label>
        <select id="qs-locale" className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="qs-title">Quote description</label>
        <input id="qs-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="qs-amount">Amount ($)</label>
        <input id="qs-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Sending…" : "Send quote"}</button>
        {state.msg && <span className={`text-xs ${state.kind === "err" ? "text-red-400" : "text-navy-300"}`}>{state.msg}</span>}
      </div>
    </form>
  );
}
