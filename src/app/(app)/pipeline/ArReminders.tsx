"use client";

import { useState } from "react";

type Draft = { customerName: string; locale: string; total: string | number; text: string };
type RemindResult = {
  count?: number;
  sent?: number;
  attempted?: number;
  /** Customers with open invoices beyond the per-run send cap. */
  leftover?: number;
  drafts?: Draft[];
  error?: string;
};

/** Draft-first AR reminders: preview what would go out, then confirm to send. */
export default function ArReminders({ canSend }: { canSend: boolean }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(confirm: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/invoices/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirm ? { confirm: true } : {}),
      });
      const body: RemindResult = await res.json();
      if (!res.ok) {
        setMsg(body.error ?? `Error ${res.status}`);
        return;
      }
      if (confirm) {
        setMsg(
          typeof body.sent === "number"
            ? `Delivered ${body.sent}/${body.attempted} reminder(s). Channels: WhatsApp when a phone is on file, email otherwise. Nothing was sent without your confirm.` +
              (body.leftover && body.leftover > 0
                ? ` ${body.leftover} customer(s) beyond the send cap stay queued for the next run.`
                : "")
            : "Nothing to send.",
        );
        setDrafts((body.drafts ?? []).map((d) => ({ ...d, total: String(d.total) })));
      } else {
        setDrafts(body.drafts ?? []);
        setMsg(null);
      }
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Payment reminders</h2>
          <p className="muted mt-1 text-xs">
            Groups every unpaid invoice per customer and drafts a reminder in their language (WhatsApp when a number is on file, email otherwise).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run(false)} disabled={busy || !canSend} className="btn-ghost !py-1.5 text-xs">
            {busy ? "…" : "Preview drafts"}
          </button>
          <button onClick={() => run(true)} disabled={busy || !canSend} className="btn-primary !py-1.5 text-xs">
            {busy ? "…" : "Confirm & send"}
          </button>
        </div>
      </div>
      {msg && <div className="mt-3 rounded-xl border border-cue-green/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{msg}</div>}
      {drafts === null && !msg && (
        <p className="muted mt-4 text-xs">Drafts only — nothing goes out until you confirm.</p>
      )}
      <div className="mt-3 space-y-2">
        {(drafts ?? []).map((d) => (
          <details key={d.customerName} className="rounded-xl border border-white/[0.06] px-4 py-3">
            <summary className="cursor-pointer list-none text-sm text-navy-100">
              {d.customerName} <span className="badge-low ms-2">{d.locale}</span>
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-navy-300">{d.text}</pre>
          </details>
        ))}
        {drafts !== null && drafts.length === 0 && (
          <p className="muted text-xs">No unpaid invoices — nothing to remind.</p>
        )}
      </div>
    </section>
  );
}
