// ─────────────────────────────────────────────────────────────
// Quiz model: SINGLE (one right choice — the legacy default),
// MULTI (all correct options must be selected) and FREE (short
// answer; correct if it includes any keyword, case-insensitive).
// Grading lives here so it can be unit-tested and reused by the
// submitQuiz server action.
// ─────────────────────────────────────────────────────────────

export type QuizQuestion =
  | { type?: "SINGLE"; q: string; options: string[]; answerIndex: number }
  | { type: "MULTI"; q: string; options: string[]; answerIndexes: number[] }
  | { type: "FREE"; q: string; keywords: string[]; sampleAnswer?: string };

export type QuizAnswer = number | number[] | string | undefined | null;

export type QuizReviewItem =
  | { kind: "SINGLE"; correctIndex: number }
  | { kind: "MULTI"; correctIndexes: number[] }
  | { kind: "FREE"; keywords: string[] };

export function gradeQuizSubmission(questions: QuizQuestion[], answers: QuizAnswer[]) {
  let correct = 0;
  questions.forEach((q, i) => {
    const a = answers[i];
    if ("answerIndex" in q) {
      if (typeof a === "number" && a === q.answerIndex) correct++;
    } else if (q.type === "MULTI") {
      const want = [...new Set(q.answerIndexes)].sort().join(",");
      const got = Array.isArray(a) ? [...new Set(a)].sort().join(",") : "__";
      if (got === want) correct++;
    } else if (q.type === "FREE") {
      if (typeof a === "string") {
        const norm = a.toLowerCase();
        if (q.keywords.some((k) => norm.includes(k.toLowerCase()))) correct++;
      }
    }
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  const review: QuizReviewItem[] = questions.map((q) =>
    "answerIndex" in q
      ? { kind: "SINGLE" as const, correctIndex: q.answerIndex }
      : q.type === "MULTI"
        ? { kind: "MULTI" as const, correctIndexes: [...new Set(q.answerIndexes)].sort() }
        : { kind: "FREE" as const, keywords: q.keywords }
  );
  return { correct, total: questions.length, score, review };
}
