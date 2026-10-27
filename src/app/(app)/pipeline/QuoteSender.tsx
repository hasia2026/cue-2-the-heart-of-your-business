"use client";

import { useState } from "react";

type Customer = { id: string; name: string; email: string | null; preferred_locale: string | null };
type Assembly = { id: string; name: string; bundleTotal: number };
type OptRow = { name: string; amount: string; note: string };

const LOCALES = [
  { value: "", label: "Auto (customer's preference)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ar", label: "العربية" },
  { value: "vi", label: "Tiếng Việt" },
];

const EMPTY_OPT: OptRow = { name: "", amount: "", note: "" };

// Send a quote in the resolved language — ad-hoc one-liner, a one-click
// price-book assembly, or 2–4 NAMED OPTIONS the customer accepts or declines
// one by one (Good–Better–Best). Option sends are recorded with a token and
// the customer's click comes back on Pipeline as a quote decision.
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
  const [mode, setMode] = useState<"single" | "options">("single");
  const [opts, setOpts] = useState<OptRow[]>([EMPTY_OPT, EMPTY_OPT]);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  function useAssembly(id: string) {
    setAssemblyId(id);
    if (id) {
      const a = assemblies.find((x) => x.id === id);
      if (a) { setTitle(`Bundle — ${a.name}`); setAmount(String(Math.round(a.bundleTotal))); }
    }
  }

  function setOpt(i: number, patch: Partial<OptRow>) {
    setOpts((os) => os.map((o, j) => (i === j ? { ...o, ...patch } : o)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || state.kind === "busy") return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "options"
            ? {
                customerId,
                title,
                options: opts
                  .filter((o) => o.name.trim() && Number.isFinite(Number(o.amount)) && o.amount !== "")
                  .map((o) => ({ name: o.name.trim(), amount: Number(o.amount), note: o.note.trim() || null })),
                ...(locale ? { locale } : {}),
              }
            : {
                customerId,
                ...(assemblyId
                  ? { assemblyId, title }
                  : { title, items: [{ description: title, amount: Number(amount) || 0 }] }),
                ...(locale ? { locale } : {}),
              },
        ),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? String(res.status));
      setState({
        kind: "ok",
        msg:
          mode === "options"
            ? `Option quote sent in ${j.langUsed ?? ""} — the customer's accept/decline lands back on Pipeline.`
            : j.langUsed
              ? `Sent${assemblyId ? " assembly bundle" : ""} in ${j.langUsed} (${j.localeSource})`
              : "Sent",
      });
    } catch (err) {
      setState({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    }
  }

  const readyOptions = opts.filter((o) => o.name.trim() && Number.isFinite(Number(o.amount)) && o.amount !== "").length;

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
        <label className="label" htmlFor="qs-mode">Quote style</label>
        <select id="qs-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as "single" | "options")}>
          <option value="single">One price — reply to accept</option>
          <option value="options">Several options — accept or decline each</option>
        </select>
        <p className="muted mt-1 text-xs">
          {mode === "options"
            ? "The email carries an Accept button per option. What they click lands back here."
            : "Classic single quote — the customer replies to the email."}
        </p>
      </div>
      {mode === "single" && assemblies.length > 0 && (
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
        <label className="label" htmlFor="qs-title">{mode === "options" ? "Job / headline" : "Quote description"}</label>
        <input id="qs-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {mode === "single" && !assemblyId && (
        <div>
          <label className="label" htmlFor="qs-amount">Amount ($)</label>
          <input id="qs-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      )}

      {mode === "options" && (
        <div className="md:col-span-2 space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-white/[0.06] px-3 py-2.5" style={{ gridTemplateColumns: "56px 1fr 130px 1fr auto" }}>
              <div className="flex items-center text-sm font-bold text-violet-200">{String.fromCharCode(65 + i)}</div>
              <input className="input" placeholder={`Option ${String.fromCharCode(65 + i)} — e.g. Repair the unit`} value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
              <input className="input" inputMode="decimal" placeholder="$" value={o.amount} onChange={(e) => setOpt(i, { amount: e.target.value })} />
              <input className="input" placeholder="Note (optional — what's included)" value={o.note} onChange={(e) => setOpt(i, { note: e.target.value })} />
              <button type="button" className="text-xs text-navy-300 hover:text-white" onClick={() => setOpts((os) => os.filter((_, j) => j !== i))} disabled={opts.length <= 2}>✕</button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setOpts((os) => [...os, EMPTY_OPT])} disabled={opts.length >= 4}>+ Add option</button>
            <span className="muted text-xs">{readyOptions} option{readyOptions === 1 ? "" : "s"} filled — at least 2 required</span>
          </div>
        </div>
      )}

      <div className="md:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={state.kind === "busy" || (mode === "options" && readyOptions < 2)}>
          {state.kind === "busy" ? "Sending…" : mode === "options" ? "Send options quote" : "Send quote"}
        </button>
        {state.msg && <span className={`text-xs ${state.kind === "err" ? "text-red-400" : "text-navy-300"}`}>{state.msg}</span>}
      </div>
    </form>
  );
}
