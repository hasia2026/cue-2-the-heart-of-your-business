"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { markTourDone } from "@/app/(app)/tour-actions";

/**
 * The one-time welcome tour. Two shapes, one flag (`setup_completed.tour`):
 *  - Owners/admins/managers get a skippable 3-step card (command bar → one
 *    capture → one quote); each step opens the real feature, nothing is
 *    simulated, and every step is a link/keypress a real page uses.
 *  - Staff/members get a single dismissible line: what ⌘K is, with an example.
 * Nothing is modal or blocking — the page stays usable behind it.
 */

export type TourVariant = "steps" | "oneline";

const EXAMPLE = "new job for Summit Air $1,250 replace heater at 4422 Cedar Ave Friday 9am";

export default function WelcomeTour({
  variant,
  ambassadorName,
}: {
  variant: TourVariant;
  ambassadorName: string | null;
}) {
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [stepDone, setStepDone] = useState<Record<number, boolean>>({});

  // Staff dismissal is per-browser (localStorage) so one tech's “Got it” never
  // hides the owner's card — the org-level flag is only written by the steps card.
  useEffect(() => {
    if (variant !== "oneline" || gone) return;
    try {
      if (localStorage.getItem("cue.tour.oneline") === "seen") setGone(true);
    } catch { /* private mode: banner simply shows */ }
  }, [variant, gone]);

  function finish() {
    setGone(true);
    if (variant === "oneline") {
      try { localStorage.setItem("cue.tour.oneline", "seen"); } catch { /* ignore */ }
    } else {
      startTransition(() => void markTourDone());
    }
  }

  function openCommandBar() {
    setStepDone((s) => ({ ...s, 1: true }));
    window.dispatchEvent(new CustomEvent("cue:command-open", { detail: { text: EXAMPLE } }));
  }

  if (gone) return null;

  if (variant === "oneline") {
    return (
      <div
        role="note"
        aria-label="Quick tip"
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-sm text-violet-100"
      >
        <span aria-hidden>⚡</span>
        <span>
          <b>Tip:</b> press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">⌘K</kbd> /{" "}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">Ctrl+K</kbd> on any page and just type it —
          “new job for Friday at 9am” becomes a job card you confirm.
        </span>
        <button type="button" onClick={finish} className="ms-auto rounded-full px-3 py-1 text-xs hover:bg-white/10" aria-label="Dismiss tip">
          Got it ✕
        </button>
      </div>
    );
  }

  const steps: { n: string; title: string; body: string; action: React.ReactNode; done: boolean }[] = [
    {
      n: "①",
      title: "Type what you want",
      body: `Press Ctrl+K (or ⌘K on Mac) anywhere, then type a sentence — ${ambassadorName ? `${ambassadorName} turns it` : "CUE turns it"} into a real record you confirm: jobs, quotes, visits.`,
      action: (
        <button type="button" onClick={openCommandBar} className="btn-primary !py-1.5 text-xs">
          Try it — open the command bar
        </button>
      ),
      done: !!stepDone[1],
    },
    {
      n: "②",
      title: "Capture one document",
      body: "Drop any document or photo into Capture — it gets classified, filed and made searchable on its own. No data entry.",
      action: (
        <Link href="/capture" onClick={() => setStepDone((s) => ({ ...s, 2: true }))} className="btn-ghost !py-1.5 text-xs">
          Open Capture →
        </Link>
      ),
      done: !!stepDone[2],
    },
    {
      n: "③",
      title: "Send one quote",
      body: "Build a price in the Pricing Studio, then send it in the customer's own language — your branding included.",
      action: (
        <Link href="/enhance" onClick={() => setStepDone((s) => ({ ...s, 3: true }))} className="btn-ghost !py-1.5 text-xs">
          Open Enhance →
        </Link>
      ),
      done: !!stepDone[3],
    },
  ];

  const allDone = steps.every((s) => s.done);

  return (
    <div
      role="region"
      aria-label="Welcome tour"
      className="mb-5 rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/[0.12] to-transparent p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[200px] flex-1">
          <h2 className="text-lg font-semibold text-white">Welcome — 3 things to see first</h2>
          <p className="mt-0.5 text-xs text-navy-300">
            Nothing is written until you say so — every step is optional, and nothing here can go wrong.
          </p>
        </div>
        <button type="button" onClick={finish} className="btn-ghost !py-1.5 text-xs">
          Skip — don’t show again
        </button>
      </div>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className={`rounded-xl border p-3.5 ${s.done ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}>
            <div className="text-xs font-semibold tracking-widest text-violet-300">
              {s.n} {s.done ? "· done ✓" : ""}
            </div>
            <div className="mt-1 font-medium text-white">{s.title}</div>
            <p className="mt-1 text-xs text-navy-300">{s.body}</p>
            <div className="mt-2.5">{s.action}</div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        {/* The immediate-dismiss button lives top-right ("Skip"). This one only
            exists once a step was tried, so a fresh owner sees one clear exit,
            not two near-identical buttons. */}
        {Object.keys(stepDone).length > 0 && (
          <button type="button" onClick={finish} className={allDone ? "btn-primary !py-1.5 text-xs" : "btn-ghost !py-1.5 text-xs"}>
            {allDone ? "I’m set ✓" : "Done for now — don’t show again"}
          </button>
        )}
      </div>
    </div>
  );
}
