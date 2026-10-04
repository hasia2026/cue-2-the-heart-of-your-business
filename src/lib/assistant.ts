import { prisma } from "./prisma";
import { buildCompanyContext } from "./context";
import { parseEvidence } from "./intelligence";
import { money } from "./format";

// ─────────────────────────────────────────────────────────────
// CUE AI — a grounded business guide.
// Answers are assembled from the company's actual records via
// intent-matched queries. When data is missing, CUE says so.
// No external API key required; swappable for an LLM later.
// ─────────────────────────────────────────────────────────────

export type AssistantAnswer = {
  answer: string;
  sources: { label: string; kind: string }[];
  suggested?: { label: string; href: string }[];
};

function fmtMoney(n: number) {
  return money(n);
}

export async function answerQuestion(orgId: string, question: string): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const ctx = await buildCompanyContext(orgId);

  const sources: AssistantAnswer["sources"] = [];
  const push = (label: string, kind: string) => sources.push({ label, kind });

  // Focus / "what should I do"
  if (/\b(focus|priorit|today|attention|next)\b/.test(q)) {
    const focus: string[] = [];
    if (ctx.money.unbilled > 0)
      focus.push(`1. Bill ${fmtMoney(ctx.money.unbilled)} of completed-but-unbilled work — this is revenue you have already earned.`);
    if (ctx.money.overdue > 0)
      focus.push(`2. Chase ${fmtMoney(ctx.money.overdue)} in overdue invoices — collecting existing revenue is faster than new revenue.`);
    if (ctx.counts.openEstimates > 0)
      focus.push(`3. Follow up on ${ctx.counts.openEstimates} open estimates worth ${fmtMoney(ctx.money.estimatePipeline)}.`);
    if (ctx.pendingDecisions.length > 0)
      focus.push(`4. Decide on ${ctx.pendingDecisions.length} pending recommendation${ctx.pendingDecisions.length === 1 ? "" : "s"} waiting for your approval.`);
    push("Computed from current jobs, invoices, estimates and recommendations", "Computation");

    return {
      answer:
        focus.length > 0
          ? `Here is what the data says deserves attention, in order:\n\n${focus.join("\n")}\n\nThis is ranked by money at stake and effort required — not guesswork. Each item links to its evidence.`
          : `Nothing is currently flagged. Based on the ${ctx.counts.completedJobs} completed jobs, ${ctx.counts.openEstimates} open estimates and ${ctx.counts.openTasks} open tasks on record, there is no urgent revenue or collections gap. Capture more information and CUE will surface what matters as patterns emerge.`,
      sources,
      suggested: [
        { label: "Open Dashboard", href: "/dashboard" },
        { label: "Review recommendations", href: "/understand" },
      ],
    };
  }

  // Sales
  if (/\b(sales|estimates?|pipeline|quotes?)\b/.test(q)) {
    const estimates = await prisma.estimate.findMany({
      where: { organizationId: orgId },
      include: { customer: true },
      orderBy: { sentAt: "desc" },
    });
    const open = estimates.filter((e) => e.status === "SENT" || e.status === "VIEWED");
    const accepted = estimates.filter((e) => e.status === "ACCEPTED");
    push(`${estimates.length} estimates on record`, "Estimate");
    return {
      answer: `Sales picture from your estimates:\n\n• ${open.length} open — worth ${fmtMoney(open.reduce((s, e) => s + e.amount, 0))}\n• ${accepted.length} accepted — ${fmtMoney(accepted.reduce((s, e) => s + e.amount, 0))}\n• ${estimates.filter((e) => e.status === "DECLINED").length} declined\n\n${open.length > 0 ? `The open pipeline is ${fmtMoney(ctx.money.estimatePipeline)}. Estimates older than two weeks without follow-up are the biggest leak — see the follow-up insight on your dashboard.` : "No estimates are currently open."}`,
      sources,
      suggested: [{ label: "Open Understand", href: "/understand" }],
    };
  }

  // Unbilled / billing
  if (/\b(unbilled|billing|invoice|invoicing|not billed)\b/.test(q)) {
    const jobs = await prisma.job.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true, invoices: true },
      orderBy: { completedAt: "desc" },
    });
    const unbilled = jobs.filter((j) => j.invoices.length === 0);
    push(`${unbilled.length} completed jobs matched`, "Job");
    return {
      answer:
        unbilled.length > 0
          ? `${unbilled.length} completed job${unbilled.length === 1 ? " has" : "s have"} no invoice — ${fmtMoney(ctx.money.unbilled)} of delivered-but-unbilled work:\n\n${unbilled.slice(0, 8).map((j) => `• ${j.title} — ${j.customer.name} (${fmtMoney(j.amount)})`).join("\n")}${unbilled.length > 8 ? `\n…and ${unbilled.length - 8} more.` : ""}\n\nThere is a recommendation waiting to turn these into a billing plan.`
          : `Every completed job on record (${jobs.length}) has been invoiced. Nothing is sitting unbilled.`,
      sources,
      suggested: [{ label: "Review billing recommendation", href: "/understand" }],
    };
  }

  // Customers
  if (/\b(customer|customers|client|clients|churn|retention)\b/.test(q)) {
    const plans = await prisma.customer.count({
      where: { organizationId: orgId, servicePlan: { not: null } },
    });
    push(`${ctx.counts.customers} customers, ${plans} on service plans`, "Customer");
    return {
      answer: `You have ${ctx.counts.customers} customers on record; ${plans} are on a recurring service plan.\n\n${ctx.topInsights.filter((i) => i.title.toLowerCase().includes("customer")).map((i) => `• ${i.title}`).join("\n") || "No customer risks are currently flagged — the main lever is keeping plan customers on their annual visit schedule."}`,
      sources,
      suggested: [{ label: "Open Company Compass", href: "/compass" }],
    };
  }

  // Health score
  if (/\b(health|score|compass)\b/.test(q)) {
    push("Business Health dimensions", "Computation");
    return {
      answer: `Your Business Health overview is computed live from jobs, invoices, estimates, customers, tasks and documents — never invented. Overall it currently reflects ${ctx.money.unbilled > 0 ? "unbilled work and " : ""}${ctx.money.overdue > 0 ? "overdue invoices and " : ""}${ctx.counts.openEstimates > 0 ? "an active estimate pipeline" : "a quiet pipeline"}. Every dimension on the Company Compass page shows its evidence, reasoning and confidence — click any dimension to inspect exactly why it scored what it did.`,
      sources,
      suggested: [{ label: "Open Company Compass", href: "/compass" }],
    };
  }

  // Policy / knowledge Q&A — searches actual knowledge items
  if (/\b(policy|policies|refund|onboard|procedure|how do we|who is responsible|what did we decide|handbook|warranty)\b/.test(q)) {
    const keywords = q.split(/\W+/).filter((w) => w.length > 3);
    const items = await prisma.knowledgeItem.findMany({ where: { organizationId: orgId } });
    const scored = items
      .map((item) => {
        const text = `${item.title} ${item.content} ${item.tags ?? ""}`.toLowerCase();
        const hits = keywords.filter((k) => text.includes(k)).length;
        return { item, hits };
      })
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        answer: `I searched the ${items.length} knowledge items in your workspace and found nothing matching that. I will not guess — if this policy or procedure exists, capture the document in Capture and I will index it; then I can answer from it.`,
        sources: [{ label: `${items.length} knowledge items searched`, kind: "KnowledgeItem" }],
        suggested: [{ label: "Open Knowledge", href: "/knowledge" }],
      };
    }
    for (const s of scored) push(s.item.title, "KnowledgeItem");
    return {
      answer: `From your company knowledge:\n\n${scored.map((s) => `**${s.item.title}** (${s.item.status.toLowerCase()})\n${s.item.content}`).join("\n\n")}\n\nThese answers come directly from your captured documents — see sources below.`,
      sources,
      suggested: [{ label: "Open Knowledge", href: "/knowledge" }],
    };
  }

  // Recommendations
  if (/\b(recommend|suggest|should i|approve|decision)\b/.test(q)) {
    const recs = await prisma.recommendation.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    push(`${recs.length} recommendations`, "Recommendation");
    return {
      answer:
        recs.length > 0
          ? `Current recommendations:\n\n${recs.map((r) => `• **${r.title}** — ${r.status.toLowerCase()}${r.impact ? ` · ${r.impact}` : ""}`).join("\n")}\n\nEvery recommendation shows its evidence and reasoning before you approve anything. CUE never executes a consequential action without your decision.`
          : "There are no recommendations right now. CUE generates them only when patterns in your actual data warrant action — capture more information and check back.",
      sources,
      suggested: [{ label: "Open Understand", href: "/understand" }],
    };
  }

  // Team / people
  if (/\b(team|employee|people|staff|who|department)\b/.test(q)) {
    const employees = await prisma.employee.findMany({
      where: { organizationId: orgId },
      include: { department: true },
    });
    push(`${employees.length} employees`, "Employee");
    return {
      answer: employees.length
        ? `Your team on record (${employees.length} active):\n\n${employees.slice(0, 10).map((e) => `• ${e.name} — ${e.title}${e.department ? ` · ${e.department.name}` : ""}`).join("\n")}`
        : "No employees are on record yet. Add your team in People so CUE can connect work, training and outcomes to specific roles.",
      sources,
      suggested: [{ label: "Open People", href: "/people" }],
    };
  }

  // Fallback — reflect what CUE actually knows, no fabrication
  push("Company snapshot", "Computation");
  return {
    answer: `Here is what I can tell you from your actual data right now:\n\n• ${ctx.counts.completedJobs} completed jobs, ${ctx.counts.openJobs} in flight\n• ${fmtMoney(ctx.money.unbilled)} unbilled · ${fmtMoney(ctx.money.estimatePipeline)} estimate pipeline · ${fmtMoney(ctx.money.overdue)} overdue invoices\n• ${ctx.counts.documents} documents and ${ctx.counts.knowledgeItems} knowledge items captured\n• ${ctx.pendingDecisions.length} recommendations awaiting your decision\n\nAsk me about sales, billing, customers, your team, health, company policies — or what to focus on today. If I do not know something, I will say so rather than make it up.`,
    sources,
  };
}
