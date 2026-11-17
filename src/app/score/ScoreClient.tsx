"use client";

import { useState } from "react";
import { computeLeakScore, type AnswerIndex } from "@/lib/leak-score";

type Result = {
  score: number;
  leakHours: { name: string; monthlyEstimate: number; explain: string };
  allLeaks: { name: string; monthlyEstimate: number }[];
  annualized: number;
};

const money = (n: number) => `$${n.toLocaleString()}`;

export default function ScoreClient({
  questions,
  brackets,
}: {
  questions: { id: string; text: string; options: string[] }[];
  brackets: { key: string; label: string }[];
}) {
  const [step, setStep] = useState(0);
  const [bracket, setBracket] = useState(brackets[1]?.key ?? brackets[0].key);
  const [answers, setAnswers] = useState<Record<string, AnswerIndex>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [email, setEmail] = useState("");
  const [biz, setBiz] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [error, setError] = useState<string | null>(null);

  function answer(idx: number) {
    const q = questions[step];
    const next = { ...answers, [q.id]: idx as AnswerIndex };
    setAnswers(next);
    if (step + 1 >= questions.length) {
      // Score instantly, before asking for anything. Email capture is optional
      // and lives on the results screen.
      setResult(computeLeakScore(next, bracket) as Result);
      setStep(questions.length);
      return;
    }
    setStep(step + 1);
  }

  async function sendBreakdown(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setEmailState("busy");
    setError(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          businessName: biz || undefined,
          revenueBracket: bracket,
          answers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setEmailState("ok");
    } catch (err) {
      setEmailState("err");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (step < questions.length) {
    const q = questions[step];
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-cue-blue" : i === step ? "bg-cue-blue/40" : "bg-white/10"}`} />
          ))}
        </div>
        <div className="card p-7">
          <div className="text-xs uppercase tracking-widest text-navy-300">Question {step + 1} of {questions.length}</div>
          <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">{q.text}</h2>
          <div className="mt-5 space-y-2.5">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => answer(i)}
                className="card card-hover w-full px-4 py-3.5 text-start text-sm text-navy-100"
              >
                {opt}
              </button>
            ))}
          </div>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="mt-4 text-xs text-navy-300 hover:text-white">
              ← back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!result) return null;

  const grade = result.score >= 75 ? { label: "HEALTHY", cls: "text-emerald-300" }
    : result.score >= 50 ? { label: "LEAKING", cls: "text-amber-300" }
    : { label: "CRITICAL LEAKS", cls: "text-red-300" };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="card p-7 text-center">
        <div className="text-xs uppercase tracking-widest text-navy-300">Your Revenue Leak Score</div>
        <div className="mt-3 text-6xl font-bold text-white">{result.score}</div>
        <div className={`mt-1 text-sm font-semibold uppercase tracking-widest ${grade.cls}`}>{grade.label}</div>
        <p className="muted mx-auto mt-3 max-w-md text-sm">
          Based on 5 operating questions and your revenue range. This is an estimate, not an audit —
          but it's the same math CUE runs against real records.
        </p>
      </div>

      <div className="card p-6">
        <div className="text-xs uppercase tracking-widest text-cue-orange">Your #1 leak right now</div>
        <h3 className="mt-1.5 text-xl font-bold text-white">{result.leakHours.name}</h3>
        <div className="mt-2 text-3xl font-bold text-cue-orange">≈ {money(result.leakHours.monthlyEstimate)}<span className="text-sm font-medium text-navy-300"> /month</span></div>
        <p className="muted mt-2 text-sm">{result.leakHours.explain}</p>
      </div>

      <div className="card p-6">
        <div className="text-xs uppercase tracking-widest text-navy-300">All estimated leaks</div>
        <ul className="mt-3 space-y-2.5">
          {result.allLeaks.map((l) => (
            <li key={l.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-navy-100">{l.name}</span>
              <span className={l.monthlyEstimate > 0 ? "font-semibold text-cue-orange" : "text-navy-300"}>{money(l.monthlyEstimate)}/mo</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-3">
          <span className="text-sm text-navy-300">Potential annual recovery</span>
          <span className="text-xl font-bold text-cue-green">{money(result.annualized)}</span>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">Want this breakdown in writing?</h3>
        <p className="muted mt-1 text-sm">
          Optional — your score is already above. Add an email and we&apos;ll send the same
          breakdown, with the math behind each estimate.
        </p>
        {emailState === "ok" ? (
          <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            Sent ✓ Check your inbox.
          </p>
        ) : (
          <form onSubmit={sendBreakdown} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="score-email">Work email</label>
                <input id="score-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="score-biz">Business name (optional)</label>
                <input id="score-biz" value={biz} onChange={(e) => setBiz(e.target.value)} className="input" />
              </div>
            </div>
            {error && <div className="rounded-xl border border-cue-red/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            <button disabled={emailState === "busy"} className="btn-ghost">
              {emailState === "busy" ? "Sending…" : "Email me the breakdown"}
            </button>
            <p className="text-[11px] text-navy-300/60">One email with your breakdown. No spam.</p>
          </form>
        )}
      </div>

      <div className="card p-6 text-center">
        <h3 className="text-lg font-semibold text-white">Want the real number — from your actual records?</h3>
        <p className="muted mx-auto mt-1 max-w-md text-sm">
          Book the free 20-minute Revenue Leak Scan. We run CUE against last month's jobs,
          leads and invoices, live on a screen share.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href="/book" className="btn-primary">Book the free scan</a>
          <a href="/" className="btn-ghost">Learn about CUE</a>
        </div>
      </div>
    </div>
  );
}
