import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { QUESTIONS, REVENUE_BRACKETS } from "@/lib/leak-score";
import ScoreClient from "./ScoreClient";

export const metadata = {
  title: "Revenue Leak Score — CUE",
  description: "Answer 5 questions and see where your business is quietly losing money every month — your score appears immediately, no email required.",
};

export default function ScorePage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-navy-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cue-orange" /> Free · 60 seconds · 5 questions · score shown immediately
          </div>
          <h1 className="mx-auto max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl">
            Where is your business <span className="bg-gradient-to-r from-cue-orange to-cue-red bg-clip-text text-transparent">leaking money</span> right now?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-navy-300">
            Most businesses lose thousands a month to unbilled work, slow follow-up, and stalled
            handoffs — without anyone noticing. Answer five questions and your score appears on the
            next screen, no email required.
          </p>
        </div>

        <ScoreClient
          questions={QUESTIONS.map((q) => ({ id: q.id, text: q.text, options: [...q.options] }))}
          brackets={REVENUE_BRACKETS.map((b) => ({ key: b.key, label: b.label }))}
        />
      </main>

      <PublicFooter />
    </div>
  );
}
