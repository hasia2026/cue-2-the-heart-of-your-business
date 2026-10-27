/**
 * The Compass business questionnaire — an owner sits down once, answers in
 * plain sentences, and the Executive Library up top fills itself. Questions
 * are ids the save action trusts; group is the section shown as a card.
 */
export type LibraryQuestion = {
  id: string;
  section: string;
  prompt: string;
  hint?: string;
};

export const QUESTIONS: LibraryQuestion[] = [
  // ── Your business ───────────────────────────────────────────────────────
  { id: "what_you_do", section: "Your business", prompt: "What does your company actually do, in one paragraph? Say it like you'd tell a neighbor." },
  { id: "origin_story", section: "Your business", prompt: "How did the company start, and what do you still do today because of how you started?", hint: "The founder's rules outlive the paperwork." },
  { id: "never_compromise", section: "Your business", prompt: "What are two or three things you never compromise on, no matter what the week looks like?" },
  { id: "definition_of_win", section: "Your business", prompt: "What does a great month look like — revenue, jobs, or something else? Name the number if you have it." },

  // ── What you sell ───────────────────────────────────────────────────────
  { id: "offerings", section: "What you sell", prompt: "List your main services or products in order of how much money they make you." },
  { id: "pricing_approach", section: "What you sell", prompt: "How do you set prices — time & materials, flat rate book, per unit, good-better-best?" },
  { id: "best_margin", section: "What you sell", prompt: "Which service or product is your best margin, and why do you think it is?" },
  { id: "refuse_to_sell", section: "What you sell", prompt: "What do you refuse to sell or install? (Anything you've walked away from.)" },

  // ── Customers & leads ───────────────────────────────────────────────────
  { id: "best_customer", section: "Customers & leads", prompt: "Who is your best customer — what makes them best?" },
  { id: "bad_fit", section: "Customers & leads", prompt: "Which customer type costs you money or grief? How do you spot them early?" },
  { id: "lead_sources", section: "Customers & leads", prompt: "Where do your leads come from today, roughly in order — referrals, repeat customers, ads, door hangers?" },
  { id: "reputation_rules", section: "Customers & leads", prompt: "What does your company promise people it never deviates from?" },

  // ── How the work gets done ──────────────────────────────────────────────
  { id: "job_flow", section: "How the work gets done", prompt: "Walk me through a typical job from first call to invoice — the steps, in order." },
  { id: "common_breakdowns", section: "How the work gets done", prompt: "What breaks most often in your week — scheduling, parts, callbacks, crew no-shows?" },
  { id: "sop_rules", section: "How the work gets done", prompt: "What rules does the team actually follow — checklists, scripts, service standards, uniform/custom rules?" },

  // ── Money ───────────────────────────────────────────────────────────────
  { id: "revenue_goal", section: "Money", prompt: "What's your monthly revenue goal for this year?" },
  { id: "margins_upsell", section: "Money", prompt: "What margins do you target, and what upsell rate do you expect techs to hit?" },
  { id: "payment_terms", section: "Money", prompt: "How do you bill and when — deposits, net 30, on completion? What's overdue look like?" },

  // ── Team ────────────────────────────────────────────────────────────────
  { id: "roles", section: "Team", prompt: "Who does what — roles, and each person's best strength." },
  { id: "pay_structure", section: "Team", prompt: "How is the crew paid — hourly, commission, spiffs on what?" },
  { id: "hiring_bar", section: "Team", prompt: "When you hire, what are the three things you look for?" },

  // ── Growth ──────────────────────────────────────────────────────────────
  { id: "biggest_lever", section: "Growth", prompt: "What's the single biggest growth lever for the next 12 months?" },
  { id: "competitors", section: "Growth", prompt: "Which competitors do you respect, and what do they do better?" },
  { id: "owner_time", section: "Growth", prompt: "How many hours a week do you currently work ON the business, not in it?" },
];

export const SECTION_ORDER = [...new Set(QUESTIONS.map((q) => q.section))];

export function isQuestionId(q: string): boolean {
  return QUESTIONS.some((x) => x.id === q);
}
