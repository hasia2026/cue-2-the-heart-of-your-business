import Link from "next/link";
import { LogoMark } from "@/components/NavClient";
import { QUESTIONS, REVENUE_BRACKETS } from "@/lib/leak-score";
import ScoreClient from "./ScoreClient";

export const metadata = {
  title: "Revenue Leak Score — CUE",
  description: "Answer 5 questions and see where your business is quietly losing money every month.",
};

export default function ScorePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-white">
            <LogoMark className="h-6 w-6" /> CUE
          </Link>
          <a href="/signin" className="text-sm text-navy-300 hover:text-white">Sign in</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-navy-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cue-orange" /> Free · takes 60 seconds · 5 questions
          </div>
          <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl">
            Where is your business <span className="bg-gradient-to-r from-cue-orange to-cue-red bg-clip-text text-transparent">leaking money</span> right now?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-navy-300">
            Most businesses lose thousands a month to unbilled work, slow follow-up, and stalled
            handoffs — without anyone noticing. Find yours.
          </p>
        </div>

        <ScoreClient
          questions={QUESTIONS.map((q) => ({ id: q.id, text: q.text, options: [...q.options] }))}
          brackets={REVENUE_BRACKETS.map((b) => ({ key: b.key, label: b.label }))}
        />
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-navy-300/60">
        <LogoMark className="me-1 inline h-4 w-4" /> CUE — The Heart of Your Business · Built by HASI Technologies
      </footer>
    </div>
  );
}
