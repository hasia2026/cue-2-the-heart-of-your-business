import { prisma } from "./prisma";
import type { EvidenceRef } from "./intelligence";

export type HealthDimension = {
  key: string;
  label: string;
  score: number; // 0-100
  confidence: "HIGH" | "MEDIUM" | "LOW";
  basis: string; // what data the score is computed from
  reasoning: string;
  evidenceCount: number;
  recommendation?: string;
};

export type HealthReport = {
  overall: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dimensions: HealthDimension[];
  disclaimer: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function confidenceFor(count: number): "HIGH" | "MEDIUM" | "LOW" {
  if (count >= 20) return "HIGH";
  if (count >= 5) return "MEDIUM";
  return "LOW";
}

export async function computeHealth(orgId: string): Promise<HealthReport> {
  const [jobs, invoices, estimates, customers, employees, tasks, payments, documents, recs, comms] =
    await Promise.all([
      prisma.job.findMany({ where: { organizationId: orgId } }),
      prisma.invoice.findMany({ where: { organizationId: orgId } }),
      prisma.estimate.findMany({ where: { organizationId: orgId } }),
      prisma.customer.findMany({ where: { organizationId: orgId } }),
      prisma.employee.findMany({ where: { organizationId: orgId } }),
      prisma.task.findMany({ where: { organizationId: orgId } }),
      prisma.payment.findMany({ where: { organizationId: orgId } }),
      prisma.document.findMany({ where: { organizationId: orgId } }),
      prisma.recommendation.findMany({ where: { organizationId: orgId } }),
      prisma.communication.findMany({ where: { organizationId: orgId } }),
    ]);

  const dimensions: HealthDimension[] = [];

  // Revenue — share of completed work that has been billed and paid
  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const billedJobIds = new Set(invoices.map((i) => i.jobId));
  const billed = completed.filter((j) => billedJobIds.has(j.id)).length;
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const revenueBase = completed.length + paidCount;
  dimensions.push({
    key: "revenue",
    label: "Revenue",
    score: revenueBase === 0 ? 0 : clamp((billed + paidCount) / revenueBase * 100),
    confidence: confidenceFor(revenueBase),
    basis: `${completed.length} completed jobs, ${invoices.length} invoices, ${paidCount} paid`,
    reasoning:
      billed === completed.length
        ? "All completed work has been invoiced."
        : `${completed.length - billed} completed job(s) are still unbilled, which lowers this score.`,
    evidenceCount: revenueBase,
    recommendation:
      billed === completed.length ? undefined : "Invoice all completed jobs to raise this dimension.",
  });

  // Sales pipeline — open estimates and how stale they are
  const open = estimates.filter((e) => e.status === "SENT" || e.status === "VIEWED");
  const stale = open.filter(
    (e) =>
      !e.lastFollowUpAt ||
      Date.now() - new Date(e.lastFollowUpAt).getTime() > 14 * 86_400_000
  );
  const staleShare = open.length === 0 ? 0 : stale.length / open.length;
  dimensions.push({
    key: "pipeline",
    label: "Sales pipeline",
    score: clamp(100 - staleShare * 100),
    confidence: confidenceFor(estimates.length),
    basis: `${estimates.length} estimates total, ${open.length} open, ${stale.length} without recent follow-up`,
    reasoning:
      stale.length === 0
        ? "Open estimates are being actively followed up."
        : `${stale.length} of ${open.length} open estimates have had no follow-up in 14+ days.`,
    evidenceCount: estimates.length,
    recommendation: stale.length > 0 ? "Work the estimate follow-up plan in Execute." : undefined,
  });

  // Cash flow — payments collected vs invoiced
  const invoicedTotal = invoices
    .filter((i) => i.status !== "VOID" && i.status !== "DRAFT")
    .reduce((s, i) => s + i.amount, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const collectionRate = invoicedTotal === 0 ? 0 : paidTotal / invoicedTotal;
  dimensions.push({
    key: "cashflow",
    label: "Cash flow",
    score: clamp(collectionRate * 100),
    confidence: confidenceFor(invoices.length),
    basis: `$${Math.round(invoicedTotal).toLocaleString()} invoiced, $${Math.round(paidTotal).toLocaleString()} collected`,
    reasoning:
      collectionRate >= 0.8
        ? "Most invoiced value has been collected."
        : `Only ${Math.round(collectionRate * 100)}% of invoiced value has been collected so far.`,
    evidenceCount: invoices.length + payments.length,
    recommendation: collectionRate < 0.8 ? "Chase overdue invoices to improve collections." : undefined,
  });

  // Customers — repeat rate
  const customersWithJobs = new Set(jobs.map((j) => j.customerId));
  const repeatRate =
    customers.length === 0
      ? 0
      : customersWithJobs.size / customers.length;
  dimensions.push({
    key: "customers",
    label: "Customers",
    score: clamp(repeatRate * 100),
    confidence: confidenceFor(customers.length),
    basis: `${customers.length} customers, ${customersWithJobs.size} with recorded jobs, ${comms.length} communications`,
    reasoning:
      "Score reflects how much of the customer book has real engagement records. Customers with no activity history are unknown quantities.",
    evidenceCount: customers.length + comms.length,
  });

  // Operations — task throughput
  const openTasks = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const doneTasks = tasks.filter((t) => t.status === "DONE");
  const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());
  const opScore = tasks.length === 0 ? 0 : clamp((doneTasks.length / tasks.length) * 100 - overdueTasks.length * 10);
  dimensions.push({
    key: "operations",
    label: "Operations",
    score: opScore,
    confidence: confidenceFor(tasks.length),
    basis: `${openTasks.length} open tasks, ${doneTasks.length} completed, ${overdueTasks.length} overdue`,
    reasoning:
      overdueTasks.length > 0
        ? `${overdueTasks.length} overdue task(s) are dragging execution down.`
        : "Tasks are being completed without a large backlog.",
    evidenceCount: tasks.length,
    recommendation: overdueTasks.length > 0 ? "Clear overdue tasks in Execute." : undefined,
  });

  // Team
  const active = employees.filter((e) => e.status === "ACTIVE");
  const withSkills = active.filter((e) => (e.skills ?? "").length > 0);
  const teamScore = active.length === 0 ? 0 : clamp((withSkills.length / active.length) * 100);
  dimensions.push({
    key: "team",
    label: "Team",
    score: teamScore,
    confidence: confidenceFor(employees.length),
    basis: `${active.length} active employees, ${withSkills.length} with recorded skills`,
    reasoning:
      "Based on how much CUE knows about your team — skills, responsibilities and departments on record.",
    evidenceCount: employees.length,
    recommendation:
      teamScore < 70 ? "Fill in employee skills and responsibilities in People to improve visibility." : undefined,
  });

  // Data quality — how much CUE actually knows
  const knowledgeCount = await prisma.knowledgeItem.count({ where: { organizationId: orgId } });
  const dataPoints = documents.length + knowledgeCount + comms.length;
  const dataScore = clamp(Math.min(100, dataPoints * 4));
  dimensions.push({
    key: "data",
    label: "Data quality",
    score: dataScore,
    confidence: dataScore > 50 ? "HIGH" : "MEDIUM",
    basis: `${documents.length} documents, ${knowledgeCount} knowledge items, ${comms.length} communications`,
    reasoning:
      "This score measures how much information CUE has to work with — more captured information makes every other score more reliable.",
    evidenceCount: dataPoints,
    recommendation: dataScore < 60 ? "Capture more documents and records to sharpen CUE's intelligence." : undefined,
  });

  // Strategic progress — goals set vs tracked, decisions made
  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: orgId },
    include: { goals: true },
  });
  const goalCount = profile?.goals.length ?? 0;
  const decided = recs.filter((r) => r.status !== "PENDING").length;
  const strategyScore = clamp(Math.min(100, goalCount * 20 + decided * 10));
  dimensions.push({
    key: "strategy",
    label: "Strategic progress",
    score: strategyScore,
    confidence: goalCount > 0 ? "MEDIUM" : "LOW",
    basis: `${goalCount} goals defined, ${decided} recommendation decisions made`,
    reasoning:
      "Reflects whether the business is actively setting goals and acting on intelligence rather than letting recommendations sit.",
    evidenceCount: goalCount + decided,
    recommendation: goalCount === 0 ? "Define goals in Company Compass." : undefined,
  });

  const scored = dimensions.filter((d) => d.confidence !== "LOW");
  const allLow = scored.length === 0;
  const overall = allLow
    ? null
    : Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length);

  const lowConfidenceShare = dimensions.filter((d) => d.confidence === "LOW").length / dimensions.length;
  const confidence: "HIGH" | "MEDIUM" | "LOW" =
    lowConfidenceShare > 0.5 ? "LOW" : lowConfidenceShare > 0.2 ? "MEDIUM" : "HIGH";

  return {
    overall,
    confidence,
    dimensions,
    disclaimer:
      "This score is CUE's transparent reading of the data currently in your workspace. It is a decision aid, not an objective scientific rating — every dimension shows exactly what it is computed from.",
  };
}
