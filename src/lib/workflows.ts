import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { parseEvidence } from "./intelligence";

// ─────────────────────────────────────────────────────────────
// Workflow creation — converts an approved recommendation into
// concrete tasks with owners, deadlines and customer context.
// The user triggers it; CUE never auto-executes.
// ─────────────────────────────────────────────────────────────

export async function createWorkflowFromRecommendation(
  orgId: string,
  userId: string,
  recId: string
): Promise<{ workflowId: string; taskCount: number }> {
  const rec = await prisma.recommendation.findUnique({
    where: { id: recId },
    include: { insight: true },
  });
  if (!rec || rec.organizationId !== orgId) throw new Error("Recommendation not found");

  const evidence = rec.insight ? await parseEvidence(rec.insight.evidence) : [];

  let tasks: { title: string; detail: string; priority: string; customerId?: string; dueInDays: number }[] = [];

  if (rec.action === "RESPOND_TO_LEADS") {
    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId, status: "NEW" },
      orderBy: { createdAt: "asc" },
    });
    const stale = leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() > 24 * 3_600_000);
    tasks = stale.map((l) => ({
      title: `Contact lead: ${l.name} — ${l.interest ?? "general inquiry"}`,
      detail: `${l.source} lead arrived ${new Date(l.createdAt).toLocaleString()} and has had no response. Call or text now, log the outcome, and set the next follow-up. Response speed is the strongest close-rate predictor.`,
      priority: "HIGH",
      dueInDays: 0,
    }));
  } else if (rec.action === "FOLLOW_UP_DEALS") {
    const deals = await prisma.deal.findMany({
      where: { organizationId: orgId, status: "NEGOTIATING" },
      include: { customer: true, vehicle: true },
      orderBy: { createdAt: "asc" },
    });
    const stalled = deals.filter((d) => Date.now() - new Date(d.createdAt).getTime() > 3 * 86_400_000);
    tasks = stalled.map((d) => ({
      title: `Follow up: ${d.customer.name} — ${d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : d.dealType}`,
      detail: `Deal open since ${new Date(d.createdAt).toLocaleDateString()} at $${d.amount.toLocaleString()} with no movement in 3+ days. Re-desk if needed, offer a fresh angle (payment, trade, delivery timing), and log the outcome.`,
      priority: "HIGH",
      dueInDays: 1,
    }));
  } else if (rec.action === "BILL_SERVICE_ORDERS") {
    const orders = await prisma.serviceOrder.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true },
      orderBy: { completedAt: "asc" },
    });
    const unbilled = orders.filter((o) => !o.invoicedAt);
    tasks = unbilled.map((o) => ({
      title: `Invoice service: ${o.title} — ${o.customer.name}`,
      detail: `Generate and send the invoice for completed service order ($${o.amount.toFixed(2)}). Verify parts and labor lines before sending — target is invoice within 24 hours of completion.`,
      priority: o.amount > 500 ? "HIGH" : "MEDIUM",
      customerId: o.customerId,
      dueInDays: 1,
    }));
  } else if (rec.action === "PRICE_REVIEW_AGED") {
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId: orgId, status: "AVAILABLE" },
      orderBy: { listedAt: "asc" },
    });
    const aged = vehicles.filter((v) => v.listedAt && Date.now() - new Date(v.listedAt).getTime() > 30 * 86_400_000);
    tasks = aged.map((v) => ({
      title: `Price review: ${v.year} ${v.make} ${v.model} (${v.stockNumber})`,
      detail: `Listed ${v.listedAt ? new Date(v.listedAt).toLocaleDateString() : "unknown"} at $${(v.listPrice ?? 0).toLocaleString()} (cost $${(v.cost ?? 0).toLocaleString()}). Unit is past the 30-day review threshold and accruing floorplan interest daily. Check market comparables and decide: reprice, detail/re-photograph, or wholesale.`,
      priority: "MEDIUM",
      dueInDays: 2,
    }));
  } else if (rec.action === "BILL_UNBILLED_JOBS") {
    const jobs = await prisma.job.findMany({
      where: { organizationId: orgId, status: "COMPLETED" },
      include: { customer: true, invoices: true },
      orderBy: { completedAt: "asc" },
    });
    const unbilled = jobs.filter((j) => j.invoices.length === 0);
    tasks = unbilled.map((j) => ({
      title: `Invoice: ${j.title} — ${j.customer.name}`,
      detail: `Generate and send an invoice for ${j.title} ($${j.amount.toFixed(2)}). Job completed ${j.completedAt ? new Date(j.completedAt).toLocaleDateString() : "recently"}. Verify scope and rates before sending.`,
      priority: j.amount > 1500 ? "HIGH" : "MEDIUM",
      customerId: j.customerId,
      dueInDays: 3,
    }));
  } else if (rec.action === "FOLLOW_UP_ESTIMATES") {
    const estimates = await prisma.estimate.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "VIEWED"] } },
      include: { customer: true },
      orderBy: { sentAt: "asc" },
    });
    const stale = estimates.filter(
      (e) =>
        !e.lastFollowUpAt ||
        Date.now() - new Date(e.lastFollowUpAt).getTime() > 14 * 86_400_000
    );
    tasks = stale.map((e) => ({
      title: `Follow up: ${e.title} — ${e.customer.name}`,
      detail: `Call ${e.customer.name} about the ${e.status.toLowerCase()} estimate ($${e.amount.toFixed(2)}), sent ${e.sentAt ? new Date(e.sentAt).toLocaleDateString() : "recently"}${e.lastFollowUpAt ? `, last follow-up ${new Date(e.lastFollowUpAt).toLocaleDateString()}` : ", never followed up"}. Log the outcome in CUE after the call.`,
      priority: e.amount > 4000 ? "HIGH" : "MEDIUM",
      customerId: e.customerId,
      dueInDays: 2,
    }));
  } else if (rec.action === "REMIND_OVERDUE_INVOICES") {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
      include: { customer: true },
    });
    const overdue = invoices.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < Date.now());
    tasks = overdue.map((i) => ({
      title: `Payment reminder: ${i.number} — ${i.customer.name}`,
      detail: `Send a friendly payment reminder for invoice ${i.number} ($${i.amount.toFixed(2)}), due ${i.dueAt ? new Date(i.dueAt).toLocaleDateString() : "recently"}. Offer payment options if there is an issue.`,
      priority: "MEDIUM",
      customerId: i.customerId,
      dueInDays: 1,
    }));
  } else if (rec.action === "SCHEDULE_PLAN_VISITS") {
    const customers = await prisma.customer.findMany({
      where: { organizationId: orgId, servicePlan: { not: null }, status: "ACTIVE" },
      include: { jobs: { orderBy: { scheduledFor: "desc" }, take: 1 } },
    });
    const neglected = customers.filter(
      (c) =>
        c.jobs.length > 0 &&
        Date.now() - new Date(c.jobs[0].scheduledFor ?? c.jobs[0].completedAt ?? c.createdAt).getTime() >
          330 * 86_400_000
    );
    tasks = neglected.map((c) => ({
      title: `Schedule annual service: ${c.name}`,
      detail: `${c.name} is on the ${c.servicePlan} plan and their last visit was ${new Date(c.jobs[0].scheduledFor ?? c.jobs[0].completedAt ?? c.createdAt).toLocaleDateString()}. Book the annual visit and confirm any warranty items.`,
      priority: "MEDIUM",
      customerId: c.id,
      dueInDays: 7,
    }));
  }

  if (tasks.length === 0) {
    tasks = [
      {
        title: rec.title,
        detail: rec.rationale,
        priority: "MEDIUM",
        dueInDays: 5,
      },
    ];
  }

  const workflow = await prisma.workflow.create({
    data: {
      organizationId: orgId,
      recId: rec.id,
      title: rec.title,
      description: `Created from recommendation "${rec.title}". ${evidence.length} evidence record(s) linked.`,
      kind:
        rec.action === "BILL_UNBILLED_JOBS"
          ? "BILLING"
          : rec.action === "FOLLOW_UP_ESTIMATES"
            ? "FOLLOW_UP"
            : rec.action === "SCHEDULE_PLAN_VISITS"
              ? "PROCESS"
              : "CUSTOM",
    },
  });

  const now = Date.now();
  await prisma.task.createMany({
    data: tasks.map((t) => ({
      organizationId: orgId,
      workflowId: workflow.id,
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      customerId: t.customerId,
      origin: "WORKFLOW",
      dueAt: new Date(now + t.dueInDays * 86_400_000),
    })),
  });

  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "EXECUTED", workflowId: workflow.id, decidedAt: new Date(), decidedById: userId },
  });
  if (rec.insightId) {
    await prisma.insight.update({ where: { id: rec.insightId }, data: { status: "ACTION_TAKEN" } }).catch(() => {});
  }

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: userId,
    action: "WORKFLOW_CREATED",
    targetType: "Workflow",
    targetId: workflow.id,
    detail: `${tasks.length} task(s) created from recommendation`,
    metadata: { recId, action: rec.action, taskCount: tasks.length },
  });

  return { workflowId: workflow.id, taskCount: tasks.length };
}
