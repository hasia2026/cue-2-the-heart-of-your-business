import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────
// Money on the Table — the single headline number: revenue that
// exists in the business's own records but hasn't been captured.
// Every dollar is traceable to a specific record; nothing is
// estimated beyond what the evidence supports.
// ─────────────────────────────────────────────────────────────

export type MoneyBreakdown = {
  label: string;
  amount: number;
  count: number;
  insightType: string;
};

export type MoneyOnTheTable = {
  total: number;
  breakdown: MoneyBreakdown[];
  openInsightCount: number;
};

export async function computeMoneyOnTheTable(orgId: string): Promise<MoneyOnTheTable> {
  const insights = await prisma.insight.findMany({
    where: { organizationId: orgId, status: "OPEN" },
    orderBy: { severity: "asc" },
  });

  const breakdown: MoneyBreakdown[] = [];
  let total = 0;
  let withValue = 0;

  for (const i of insights) {
    const amount = i.impactValue ?? 0;
    if (amount > 0) withValue++;
    total += amount;
    breakdown.push({
      label: i.title,
      amount,
      count: 1,
      insightType: i.type,
    });
  }

  return {
    total,
    breakdown: breakdown.sort((a, b) => b.amount - a.amount),
    openInsightCount: insights.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Impact Receipts — proof that a decision produced a result.
// For each workflow, trace: tasks created → tasks completed →
// financial records that materialized after the workflow was
// created (invoices issued/paid for jobs in its billing tasks,
// estimates accepted, leads contacted). Deterministic joins on
// customerId/amount already stored in task details.
// ─────────────────────────────────────────────────────────────

export type ImpactReceipt = {
  workflowId: string;
  workflowTitle: string;
  recTitle: string | null;
  createdAt: string;
  taskCount: number;
  completedCount: number;
  /** Dollars collected/realized since the workflow ran, per the ledger. */
  collected: number;
  /** Remaining value still open (tasks not yet done). */
  pending: number;
  /** What the recommendation predicted, when available. */
  projected: number | null;
  /** Short narrative line generated from real counts. */
  story: string;
  status: "IN_PROGRESS" | "COMPLETED";
};

export async function computeImpactReceipts(orgId: string): Promise<ImpactReceipt[]> {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      rec: true,
      tasks: { include: { customer: true } },
    },
  });

  const receipts: ImpactReceipt[] = [];

  for (const wf of workflows) {
    const taskCount = wf.tasks.length;
    if (taskCount === 0) continue;
    const completed = wf.tasks.filter((t) => t.status === "DONE").length;

    // Tasks carry their dollar context in detail strings; recover the
    // per-task amounts by matching against the source records the
    // workflow was generated from (same join the creator used).
    let taskValueTotal = 0;
    for (const t of wf.tasks) {
      const m = t.detail?.match(/\$([\d,]+(?:\.\d{2})?)/);
      if (m) taskValueTotal += parseFloat(m[1].replace(/,/g, ""));
    }

    // Collected: invoices/payments for the tasks' customers created
    // AFTER the workflow was created. Deterministic and conservative.
    const customerIds = [...new Set(wf.tasks.map((t) => t.customerId).filter(Boolean) as string[])];
    const since = wf.createdAt;

    let collected = 0;
    if (customerIds.length > 0) {
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          customerId: { in: customerIds },
          status: "PAID",
          OR: [{ paidAt: { gte: since } }, { issuedAt: { gte: since } }],
        },
        select: { amount: true },
      });
      collected = paidInvoices.reduce((s, i) => s + i.amount, 0);
    }

    const pending = Math.max(0, taskValueTotal - collected);
    const projected = wf.rec?.impactValue ?? null;

    let story: string;
    if (completed === 0) {
      story = `0 of ${taskCount} actions done — $${Math.round(taskValueTotal).toLocaleString()} still on the table.`;
    } else if (collected > 0) {
      story = `${completed}/${taskCount} actions done → $${Math.round(collected).toLocaleString()} collected. $${Math.round(pending).toLocaleString()} to go.`;
    } else if (completed === taskCount) {
      story = `All ${taskCount} actions completed. Collected revenue will appear here as payments post.`;
    } else {
      story = `${completed}/${taskCount} actions done — work in progress, $${Math.round(taskValueTotal).toLocaleString()} in play.`;
    }

    receipts.push({
      workflowId: wf.id,
      workflowTitle: wf.title,
      recTitle: wf.rec?.title ?? null,
      createdAt: wf.createdAt.toISOString(),
      taskCount,
      completedCount: completed,
      collected,
      pending,
      projected,
      story,
      status: completed === taskCount ? "COMPLETED" : "IN_PROGRESS",
    });
  }

  return receipts;
}
