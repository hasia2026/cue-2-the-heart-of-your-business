import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────
// Context retrieval — the single service the AI assistant (and
// future LLM integrations) use to ground answers in real data.
// Returns compact JSON; never fabricates.
// ─────────────────────────────────────────────────────────────

export type CompanyContext = {
  business: {
    name: string;
    industry: string | null;
    size: string | null;
    mission: string | null;
    goals: string[];
  };
  counts: {
    customers: number;
    employees: number;
    openJobs: number;
    completedJobs: number;
    openEstimates: number;
    overdueInvoices: number;
    openTasks: number;
    documents: number;
    knowledgeItems: number;
    pendingRecommendations: number;
  };
  money: {
    unbilled: number;
    estimatePipeline: number;
    overdue: number;
    collected: number;
  };
  topInsights: { title: string; severity: string; impactValue: number | null }[];
  pendingDecisions: { title: string; impact: string | null }[];
  openTasks: { title: string; priority: string; dueAt: string | null }[];
};

export async function buildCompanyContext(orgId: string): Promise<CompanyContext> {
  const [profile, customers, employees, jobs, estimates, invoices, tasks, documents, knowledge, recs, insights, payments] =
    await Promise.all([
      prisma.businessProfile.findUnique({ where: { organizationId: orgId }, include: { goals: true } }),
      prisma.customer.count({ where: { organizationId: orgId } }),
      prisma.employee.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
      prisma.job.findMany({ where: { organizationId: orgId }, select: { status: true, amount: true, invoices: { select: { id: true } } } }),
      prisma.estimate.findMany({ where: { organizationId: orgId, status: { in: ["SENT", "VIEWED"] } }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { organizationId: orgId }, select: { status: true, amount: true, dueAt: true } }),
      prisma.task.findMany({ where: { organizationId: orgId }, select: { status: true, title: true, priority: true, dueAt: true } }),
      prisma.document.count({ where: { organizationId: orgId } }),
      prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
      prisma.recommendation.findMany({ where: { organizationId: orgId, status: "PENDING" }, select: { title: true, impact: true } }),
      prisma.insight.findMany({ where: { organizationId: orgId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.payment.findMany({ where: { organizationId: orgId }, select: { amount: true } }),
    ]);

  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const unbilled = completed.filter((j) => j.invoices.length === 0);
  const overdue = invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "VOID" && i.dueAt && new Date(i.dueAt).getTime() < Date.now()
  );
  const openTasks = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");

  return {
    business: {
      name: profile?.name ?? "Unknown",
      industry: profile?.industry ?? null,
      size: profile?.size ?? null,
      mission: profile?.mission ?? null,
      goals: profile?.goals.map((g) => g.title) ?? [],
    },
    counts: {
      customers,
      employees,
      openJobs: jobs.filter((j) => j.status === "SCHEDULED" || j.status === "IN_PROGRESS").length,
      completedJobs: completed.length,
      openEstimates: estimates.length,
      overdueInvoices: overdue.length,
      openTasks: openTasks.length,
      documents,
      knowledgeItems: knowledge,
      pendingRecommendations: recs.length,
    },
    money: {
      unbilled: Math.round(unbilled.reduce((s, j) => s + j.amount, 0)),
      estimatePipeline: Math.round(estimates.reduce((s, e) => s + e.amount, 0)),
      overdue: Math.round(overdue.reduce((s, i) => s + i.amount, 0)),
      collected: Math.round(payments.reduce((s, p) => s + p.amount, 0)),
    },
    topInsights: insights.map((i) => ({ title: i.title, severity: i.severity, impactValue: i.impactValue })),
    pendingDecisions: recs.map((r) => ({ title: r.title, impact: r.impact })),
    openTasks: openTasks.slice(0, 8).map((t) => ({
      title: t.title,
      priority: t.priority,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    })),
  };
}
