"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  draftCommand,
  confirmCommand,
  type CommandDraft,
} from "@/app/(app)/pipeline/command-actions";

/**
 * The "type what you want" bar — on every page. Write a sentence like
 * “new job for Summit Air $1,250 replace heater at 4422 Cedar Ave Friday 9am”
 * and CUE parses it into a draft card; nothing is written until Confirm.
 * Deterministic parsing (lib/commands), so it needs no AI key and never
 * invents a customer — unmatched names always ask.
 */

const EXAMPLES = [
  "new job for Summit Air $1,250 replace heater at 4422 Cedar Ave Friday 9am",
  "estimate for Jane Smith $3,400 new furnace quote",
  "schedule a visit for John Doe tomorrow 2pm",
];

type Phase = "closed" | "input" | "draft" | "saving" | "done" | "error";

function money(v: string) {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CommandBar({ signedIn }: { signedIn: boolean }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<CommandDraft | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("0");
  const [address, setAddress] = useState("");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => {
    if (!signedIn) return;
    setPhase("input");
    setMessage(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [signedIn]);

  // ⌘K / Ctrl+K opens from anywhere; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPhase((p) => (p === "closed" ? "input" : "closed"));
      }
      if (e.key === "Escape") setPhase("closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => open();
    window.addEventListener("cue:command-open", onOpen);
    return () => window.removeEventListener("cue:command-open", onOpen);
  }, [open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (phase !== "closed" && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPhase("closed");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [phase]);

  async function makeDraft() {
    setError(null);
    setPhase("input");
    const d = await draftCommand(text);
    if (!d.ok) {
      setError(d.error ?? "Could not read that.");
      return;
    }
    setDraft(d);
    setTitle(d.title);
    setAmount(d.amount ? d.amount.toFixed(2) : "");
    setAddress(d.address ?? "");
    setWhen(toLocalInput(d.whenISO));
    setPhase("draft");
  }

  async function doConfirm() {
    if (!draft) return;
    setPhase("saving");
    const res = await confirmCommand({
      kind: draft.kind,
      customerId: draft.customerId,
      title: title.trim() || draft.title,
      amount: money(amount || "0"),
      address: address.trim() || null,
      whenISO: when ? new Date(when).toISOString() : null,
    });
    if (!res.ok) {
      setError(res.error ?? "Could not save.");
      setPhase("draft");
      return;
    }
    setMessage(res.message ?? "Done.");
    setPhase("done");
  }

  const canConfirm =
    draft &&
    draft.customerId &&
    (draft.kind !== "VISIT" || when) &&
    phase === "draft";

  if (!signedIn) return null;

  return (
    <>
      {/* Desktop launcher floats centered in the top bar header */}
      <button
        type="button"
        onClick={open}
        aria-label="Type what you want (Ctrl K)"
        className="fixed left-1/2 top-[0.65rem] z-20 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-navy-200 hover:bg-white/[0.08] lg:flex"
      >
        <span aria-hidden>⌘</span> Type what you want…
        <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-navy-300">Ctrl K</kbd>
      </button>
      {/* Mobile launcher floats above the bottom nav */}
      <button
        type="button"
        onClick={open}
        aria-label="Type what you want"
        className="fixed bottom-24 end-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/90 text-xl font-semibold text-white shadow-lg shadow-violet-500/30 lg:hidden"
      >
        ⌘
      </button>

      {phase !== "closed" && (
        <div
          ref={panelRef}
          dir="ltr"
          className="fixed bottom-20 end-4 z-40 w-[min(94vw,430px)] rounded-2xl border border-white/10 bg-ink-900/95 p-4 shadow-2xl backdrop-blur lg:bottom-6 lg:end-[max(1rem,calc((100vw-72rem)/2))]"
        >
          {phase === "input" && (
            <>
              <label className="label" htmlFor="cmd-input">
                What do you want to do?
              </label>
              <input
                id="cmd-input"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && makeDraft()}
                placeholder={EXAMPLES[0]}
                className="input"
                autoComplete="off"
              />
              {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setPhase("closed")} className="btn-ghost !py-1.5 text-xs">
                  Cancel
                </button>
                <button type="button" onClick={makeDraft} className="btn-primary !py-1.5 text-xs">
                  Preview what it will do
                </button>
              </div>
              <p className="mt-2 text-[11px] text-navy-300/70">
                Try: <em>{EXAMPLES[1]}</em> or <em>{EXAMPLES[2]}</em>
              </p>
            </>
          )}

          {phase === "draft" && draft && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-navy-100">
                {draft.kind === "ESTIMATE" ? "New estimate" : draft.kind === "VISIT" ? "New visit" : "New job"}
                {draft.customerId && draft.customerName ? (
                  <> for <span className="text-violet-200">{draft.customerName}</span></>
                ) : null}
              </p>
              {!draft.customerId && (
                <div>
                  <p className="text-xs text-amber-300">
                    Which customer?{draft.alternatives.length ? " Pick one:" : " No match found — pick below or add them first."}
                  </p>
                  <select
                    className="input mt-1 text-xs"
                    value=""
                    onChange={(e) => {
                      const m = draft.alternatives.find((a) => a.id === e.target.value);
                      if (m) {
                        setDraft({ ...draft, customerId: m.id, customerName: m.name, missing: draft.missing.filter((x) => x !== "customer") });
                      }
                    }}
                  >
                    <option value="">Select a customer…</option>
                    {draft.alternatives.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="block text-xs text-navy-300">
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1 text-xs" />
              </label>
              {draft.kind !== "VISIT" && (
                <label className="block text-xs text-navy-300">
                  Amount ($)
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    className="input mt-1 text-xs"
                    placeholder="0"
                  />
                </label>
              )}
              <label className="block text-xs text-navy-300">
                Property address <span className="text-navy-400">(this job only)</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input mt-1 text-xs" placeholder="Customer's primary address" />
              </label>
              <label className="block text-xs text-navy-300">
                Visit time {draft.kind === "VISIT" ? "(required)" : "(optional)"}
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input mt-1 text-xs" />
              </label>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button type="button" onClick={() => setPhase("input")} className="btn-ghost !py-1.5 text-xs">
                  ← Edit request
                </button>
                <button type="button" disabled={!canConfirm} onClick={doConfirm} className="btn-primary !py-1.5 text-xs disabled:opacity-40">
                  Confirm &amp; save
                </button>
              </div>
            </div>
          )}

          {phase === "saving" && <p className="text-sm text-navy-200">Saving…</p>}

          {phase === "done" && (
            <div className="space-y-3">
              <p className="text-sm text-green-300">{message}</p>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => { setText(""); setPhase("input"); }} className="btn-ghost !py-1.5 text-xs">
                  Add another
                </button>
                <a href="/pipeline" className="btn-primary !py-1.5 text-xs">
                  Open Pipeline
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
