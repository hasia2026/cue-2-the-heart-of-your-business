// Revenue Leak Score — public diagnostic engine.
// 5 questions × 0-3 health points → score 0-100, plus the single worst leak
// with a concrete dollar estimate derived from a revenue bracket.
// Deterministic and honest: the estimate is labeled as an estimate everywhere.

export type AnswerIndex = 0 | 1 | 2 | 3;

export type Question = {
  id: string;
  text: string;
  options: [string, string, string, string]; // worst → best (index = health points)
  leak: {
    name: string;
    // % of annual revenue leaked per severity step (0 = worst option chosen)
    monthlyPct: number;
    explain: string;
  };
};

export const REVENUE_BRACKETS: { key: string; label: string; annual: number }[] = [
  { key: "under_500k", label: "Under $500k/yr", annual: 400_000 },
  { key: "500k_2m", label: "$500k – $2M/yr", annual: 1_200_000 },
  { key: "2m_5m", label: "$2M – $5M/yr", annual: 3_500_000 },
  { key: "5m_plus", label: "$5M+/yr", annual: 8_000_000 },
];

export const QUESTIONS: Question[] = [
  {
    id: "billing",
    text: "How long after a job or repair order is finished does it get invoiced?",
    options: [
      "A week or more — billing happens when someone has time",
      "2–3 days",
      "Same day, most of the time",
      "Within hours — it's a hard rule",
    ],
    leak: {
      name: "Completed work sitting unbilled",
      monthlyPct: 0.025,
      explain:
        "Finished work that isn't invoiced within 24–48h is the most common silent leak. Customers never chase a bill that was never sent — the revenue quietly disappears.",
    },
  },
  {
    id: "leads",
    text: "When a new lead or inquiry comes in, how fast does someone reach out?",
    options: [
      "When we get to it — sometimes days",
      "Within a couple of days",
      "Same day, most of the time",
      "Within an hour, every time",
    ],
    leak: {
      name: "Lead follow-up decay",
      monthlyPct: 0.02,
      explain:
        "Response speed is the strongest predictor of close rate. Leads contacted after 48h convert at a fraction of the rate — most are simply lost, not postponed.",
    },
  },
  {
    id: "pricing",
    text: "How do you handle slow-moving inventory or stale offers?",
    options: [
      "We wait — the right buyer will come",
      "We review prices occasionally",
      "We review monthly against a rule",
      "Weekly review with pre-authorized discount steps",
    ],
    leak: {
      name: "Aging inventory carrying cost",
      monthlyPct: 0.012,
      explain:
        "Every idle unit or expired offer accrues carrying cost and loses buyer attention. Without pre-authorized pricing steps, the decision waits and the value decays.",
    },
  },
  {
    id: "handoff",
    text: "When work crosses between people (sales → finance, tech → billing), how does it get tracked?",
    options: [
      "Verbally or by memory",
      "Sticky notes / spreadsheets",
      "A shared tracker we update manually",
      "The system tracks it and flags anything stalled",
    ],
    leak: {
      name: "Handoff limbo",
      monthlyPct: 0.015,
      explain:
        "Deals and jobs die in the gaps between people. If nothing flags a stalled handoff, it stalls forever — the customer moves on and nobody notices.",
    },
  },
  {
    id: "receivables",
    text: "How quickly do you notice an unpaid invoice?",
    options: [
      "When we stumble on it during bookkeeping",
      "At month end",
      "Weekly review",
      "Same day — overdue items are flagged automatically",
    ],
    leak: {
      name: "Receivables drift",
      monthlyPct: 0.012,
      explain:
        "Uncollected invoices age silently. The longer the detection lag, the lower the collection rate — and the more strained the customer conversation.",
    },
  },
];

export type LeakScoreResult = {
  score: number; // 0-100, higher = healthier
  leakHours: {
    name: string;
    monthlyEstimate: number;
    explain: string;
  };
  allLeaks: { name: string; monthlyEstimate: number }[];
  annualized: number;
};

export function computeLeakScore(
  answers: Record<string, AnswerIndex>,
  revenueBracket: string
): LeakScoreResult {
  const bracket = REVENUE_BRACKETS.find((b) => b.key === revenueBracket) ?? REVENUE_BRACKETS[1];
  const monthlyRevenue = bracket.annual / 12;

  const totalPoints = QUESTIONS.reduce((acc, q) => acc + (answers[q.id] ?? 3), 0);
  const maxPoints = QUESTIONS.length * 3;
  const score = Math.round((totalPoints / maxPoints) * 100);

  const allLeaks = QUESTIONS.map((q) => {
    const idx = answers[q.id] ?? 3; // default = healthy (no leak)
    // step 0 → full leak %, step 3 → 0. Linear: (3 - idx)/3 of the max rate.
    const rate = q.leak.monthlyPct * ((3 - idx) / 3);
    return {
      name: q.leak.name,
      monthlyEstimate: Math.round(monthlyRevenue * rate),
      explain: q.leak.explain,
      severityStep: idx,
      maxRate: q.leak.monthlyPct,
    };
  });

  const worst = [...allLeaks].sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)[0];
  const monthlyTotal = allLeaks.reduce((a, l) => a + l.monthlyEstimate, 0);

  return {
    score,
    leakHours: {
      name: worst?.name ?? "No dominant leak",
      monthlyEstimate: worst?.monthlyEstimate ?? 0,
      explain: worst?.explain ?? "",
    },
    allLeaks: allLeaks.map(({ name, monthlyEstimate }) => ({ name, monthlyEstimate })),
    annualized: monthlyTotal * 12,
  };
}
