"use client";

import { useState } from "react";

type Customer = { id: string; name: string; email: string | null; preferred_locale: string | null };
type Assembly = { id: string; name: string; bundleTotal: number };

const LOCALES = [
  { value: "", label: "Auto (customer's preference)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ar", label: "العربية" },
  { value: "vi", label: "Tiếng Việt" },
];

// Send a quote in the resolved language — ad-hoc one-liner or a one-click
// price-book assembly (its lines priced standalone/add-on, expanded server-
// side). The response shows which language was actually used and why.
export default function QuoteSender({
  customers,
  assemblies = [],
}: {
  customers: Customer[];
  assemblies?: Assembly[];
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [assemblyId, setAssemblyId] = useState("");
  const [title, setTitle] = useState("Replacement quote — 3-ton system");
  const [amount, setAmount] = useState("7100");
  const [locale, setLocale] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  function useAssembly(id: string) {
    setAssemblyId(id);
    if (id) {
      const a = assemblies.find((x) => x.id === id);
      if (a) { setTitle(`Bundle — ${a.name}`); setAmount(String(Math.round(a.bundleTotal))); }
    }
  }

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
          ...(assemblyId
            ? { assemblyId, title }
            : { title, items: [{ description: title, amount: Number(amount) || 0 }] }),
          ...(locale ? { locale } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? String(res.status));
      setState({
        kind: "ok",
        msg:
          j.langUsed
            ? `Sent${assemblyId ? " assembly bundle" : ""} in ${j.langUsed} (${j.localeSource})`
            : "Sent",
      });
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
      {assemblies.length > 0 && (
        <div>
          <label className="label" htmlFor="qs-assembly">Assembly bundle (optional)</label>
          <select id="qs-assembly" className="input" value={assemblyId} onChange={(e) => useAssembly(e.target.value)}>
            <option value="">— ad-hoc quote (type it below) —</option>
            {assemblies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — bundle $${Math.round(a.bundleTotal).toLocaleString()}
              </option>
            ))}
          </select>
          <p className="muted mt-1 text-xs">Choosing a bundle drops every pre-built service into the quote, each priced at its standalone or add-on rate.</p>
        </div>
      )}
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
      {!assemblyId && (
        <div>
          <label className="label" htmlFor="qs-amount">Amount ($)</label>
          <input id="qs-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      )}
      <div className="md:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Sending…" : "Send quote"}</button>
        {state.msg && <span className={`text-xs ${state.kind === "err" ? "text-red-400" : "text-navy-300"}`}>{state.msg}</span>}
      </div>
    </form>
  );
}
