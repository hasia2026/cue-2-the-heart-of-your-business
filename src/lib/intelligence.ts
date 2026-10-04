import { prisma } from "./prisma";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────
// CUE intelligence engine.
// Insights are COMPUTED from actual business records — never invented.
// Every insight carries machine-checkable evidence references.
// ─────────────────────────────────────────────────────────────

export type EvidenceRef = {
  kind:
    | "Job"
    | "Estimate"
    | "Invoice"
    | "Customer"
    | "Communication"
    | "Payment"
    | "KnowledgeItem";
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

export type ComputedInsight = {
  type: "RISK" | "OPPORTUNITY" | "REVENUE" | "OPERATIONS" | "CUSTOMER" | "ANOMALY";
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  impactValue?: number;
  evidence: EvidenceRef[];
  reasoning: string;
  confidence: number;
  recommendation?: {
    title: string;
    action: string;
    rationale: string;
    impact: string;
    impactValue?: number;
    confidence: number;
  };
};

const FOLLOW_UP_DAYS = 14;

/** Detects completed jobs that have no invoice — revenue sitting unbilled. */
async function detectUnbilledJobs(orgId: string): Promise<ComputedInsight | null> {
  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId, status: "COMPLETED" },
    include: { customer: true, invoices: true, employee: true },
    orderBy: { completedAt: "desc" },
  });
  const unbilled = jobs.filter((j) => j.invoices.length === 0);
  if (unbilled.length === 0) return null;

  const total = unbilled.reduce((s, j) => s + j.amount, 0);
  return {
    type: "REVENUE",
    title: `${unbilled.length} completed job${unbilled.length === 1 ? "" : "s"} without an invoice`,
    summary: `Work was finished but never billed. Potential unbilled revenue: $${Math.round(total).toLocaleString()}.`,
    severity: total > 5000 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: unbilled.map((j) => ({
      kind: "Job" as const,
      id: j.id,
      label: `${j.title} — ${j.customer.name}`,
      detail: `Completed ${j.completedAt ? new Date(j.completedAt).toLocaleDateString() : "date unknown"} · ${j.trade} · assigned to ${j.employee?.name ?? "unassigned"} · no invoice exists for this job`,
      amount: j.amount,
    })),
    reasoning:
      "Every completed job in a service business should produce an invoice. CUE matched completed jobs against issued invoices and found these have none, which means the work was delivered but the revenue was never requested.",
    confidence: 0.97,
    recommendation: {
      title: "Create a billing plan for unbilled jobs",
      action: "BILL_UNBILLED_JOBS",
      rationale:
        "Generating invoices for these completed jobs converts delivered work into collected revenue and prevents the backlog from growing.",
      impact: `Recover up to $${Math.round(total).toLocaleString()} in unbilled revenue`,
      impactValue: total,
      confidence: 0.97,
    },
  };
}

/** Detects estimates with no follow-up since being sent. */
async function detectEstimateLeakage(orgId: string): Promise<ComputedInsight | null> {
  const estimates = await prisma.estimate.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["SENT", "VIEWED"] },
    },
    include: { customer: true },
    orderBy: { sentAt: "desc" },
  });
  const stale = estimates.filter((e) => {
    const ref = e.lastFollowUpAt ?? e.sentAt;
    if (!ref) return true;
    return Date.now() - new Date(ref).getTime() > FOLLOW_UP_DAYS * 86_400_000;
  });
  if (stale.length === 0) return null;

  const total = stale.reduce((s, e) => s + e.amount, 0);
  return {
    type: "OPPORTUNITY",
    title: `${stale.length} estimate${stale.length === 1 ? "" : "s"} with no recent follow-up`,
    summary: `Open estimates have had no follow-up in over ${FOLLOW_UP_DAYS} days. Potential revenue waiting: $${Math.round(total).toLocaleString()}.`,
    severity: total > 20000 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: stale.map((e) => ({
      kind: "Estimate" as const,
      id: e.id,
      label: `${e.title} — ${e.customer.name}`,
      detail: `${e.status} · sent ${e.sentAt ? new Date(e.sentAt).toLocaleDateString() : "unknown"} · last follow-up ${e.lastFollowUpAt ? new Date(e.lastFollowUpAt).toLocaleDateString() : "never"}`,
      amount: e.amount,
    })),
    reasoning:
      "Estimates go cold quickly: most service-business estimates that are accepted, are accepted within the first two weeks. These have passed that window with no recorded contact, so they are likely forgotten rather than declined.",
    confidence: 0.85,
    recommendation: {
      title: "Create an estimate follow-up plan",
      action: "FOLLOW_UP_ESTIMATES",
      rationale:
        "A structured follow-up pass recovers estimates that were forgotten rather than rejected. Each contact either revives the revenue or closes the loop cleanly.",
      impact: `Up to $${Math.round(total).toLocaleString()} in pipeline revenue could be recovered or closed out`,
      impactValue: total,
      confidence: 0.75,
    },
  };
}

/** Detects invoices that are past due and unpaid. */
async function detectOverdueInvoices(orgId: string): Promise<ComputedInsight | null> {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
    include: { customer: true },
  });
  const overdue = invoices.filter(
    (i) => i.dueAt && new Date(i.dueAt).getTime() < Date.now()
  );
  if (overdue.length === 0) return null;

  const total = overdue.reduce((s, i) => s + i.amount, 0);
  return {
    type: "REVENUE",
    title: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} totaling $${Math.round(total).toLocaleString()}`,
    summary: `Invoices have passed their due date without payment. Collecting these is faster than finding new revenue.`,
    severity: "MEDIUM",
    impactValue: total,
    evidence: overdue.map((i) => ({
      kind: "Invoice" as const,
      id: i.id,
      label: `${i.number} — ${i.customer.name}`,
      detail: `${i.status} · due ${i.dueAt ? new Date(i.dueAt).toLocaleDateString() : "unknown"} · no payment recorded`,
      amount: i.amount,
    })),
    reasoning:
      "CUE compares invoice due dates against received payments. These invoices are past due with no matching payment, so cash that was expected has not arrived.",
    confidence: 0.95,
    recommendation: {
      title: "Send payment reminders for overdue invoices",
      action: "REMIND_OVERDUE_INVOICES",
      rationale:
        "Most late invoices are oversights, not refusals. A courteous reminder is the highest-yield collections action available.",
      impact: `Accelerate $${Math.round(total).toLocaleString()} in receivables`,
      impactValue: total,
      confidence: 0.7,
    },
  };
}

/** Detects service-plan customers whose only contact was the original job. */
async function detectNeglectedPlanCustomers(orgId: string): Promise<ComputedInsight | null> {
  const plans = await prisma.customer.findMany({
    where: {
      organizationId: orgId,
      servicePlan: { not: null },
      status: "ACTIVE",
    },
    include: {
      jobs: { orderBy: { scheduledFor: "desc" } },
      communications: { orderBy: { occurredAt: "desc" } },
    },
  });
  const neglected = plans.filter((c) => {
    if (c.jobs.length === 0) return false;
    const lastJob = c.jobs[0]?.scheduledFor ?? c.jobs[0]?.completedAt;
    if (!lastJob) return false;
    return Date.now() - new Date(lastJob).getTime() > 330 * 86_400_000;
  });
  if (neglected.length === 0) return null;

  return {
    type: "CUSTOMER",
    title: `${neglected.length} service-plan customer${neglected.length === 1 ? "" : "s"} approaching their renewal window without recent contact`,
    summary:
      "Service-plan customers are the most valuable recurring revenue in the book. These have had no job or contact in nearly a year.",
    severity: "MEDIUM",
    evidence: neglected.map((c) => ({
      kind: "Customer" as const,
      id: c.id,
      label: `${c.name} — ${c.servicePlan}`,
      detail: `Last job ${c.jobs[0]?.scheduledFor ? new Date(c.jobs[0].scheduledFor).toLocaleDateString() : "unknown"} · ${c.communications.length} communications on record`,
    })),
    reasoning:
      "Plan members expect an annual service visit. When one slips past ten months without contact, the renewal is at risk and the customer may perceive low value in the plan.",
    confidence: 0.8,
    recommendation: {
      title: "Schedule annual service visits for plan customers",
      action: "SCHEDULE_PLAN_VISITS",
      rationale:
        "Proactively booking the annual visit protects the renewal and creates a natural upsell conversation.",
      impact: "Protect recurring plan revenue and improve retention",
      confidence: 0.7,
    },
  };
}

// ── Industry Pack: Auto Dealership detectors ──

/** Missed leads: NEW leads with no contact past the response window. */
async function detectMissedLeads(orgId: string): Promise<ComputedInsight | null> {
  const leads = await prisma.lead.findMany({ where: { organizationId: orgId, status: "NEW" } });
  const stale = leads.filter(
    (l) => Date.now() - new Date(l.createdAt).getTime() > 24 * 3_600_000
  );
  if (stale.length === 0) return null;
  const value = stale.reduce((s, l) => s + (l.estValue ?? 0), 0);
  return {
    type: "REVENUE",
    title: `${stale.length} lead${stale.length === 1 ? "" : "s"} with no response past 24 hours`,
    summary: `Unanswered leads go cold fast — response speed is the strongest close-rate predictor. Estimated pipeline value: $${Math.round(value).toLocaleString()}.`,
    severity: stale.length >= 4 ? "HIGH" : "MEDIUM",
    impactValue: value,
    evidence: stale.map((l) => ({
      kind: "Customer" as const,
      id: l.id,
      label: `${l.name} — ${l.interest ?? "general inquiry"}`,
      detail: `${l.source} lead · arrived ${new Date(l.createdAt).toLocaleString()} · no contact recorded`,
      amount: l.estValue ?? undefined,
    })),
    reasoning:
      "CUE compares lead arrival times against contact records. These leads have passed the 15-minute response target and the 24-hour fallback window with no outreach logged.",
    confidence: 0.95,
    recommendation: {
      title: "Respond to every unanswered lead today",
      action: "RESPOND_TO_LEADS",
      rationale: "A rapid-response pass converts leads while intent is fresh and recovers deals that would silently evaporate.",
      impact: `Re-engage roughly $${Math.round(value).toLocaleString()} of pipeline`,
      impactValue: value,
      confidence: 0.8,
    },
  };
}

/** Stalled deals: NEGOTIATING with no note activity for 3+ days. */
async function detectStalledDeals(orgId: string): Promise<ComputedInsight | null> {
  const deals = await prisma.deal.findMany({
    where: { organizationId: orgId, status: "NEGOTIATING" },
    include: { customer: true, vehicle: true },
  });
  const stalled = deals.filter(
    (d) => Date.now() - new Date(d.createdAt).getTime() > 3 * 86_400_000
  );
  if (stalled.length === 0) return null;
  const value = stalled.reduce((s, d) => s + d.amount, 0);
  return {
    type: "OPPORTUNITY",
    title: `${stalled.length} deal${stalled.length === 1 ? "" : "s"} in negotiation with no movement for 3+ days`,
    summary: `Unsold deals cool quickly. Combined value: $${Math.round(value).toLocaleString()}. A structured follow-up either closes them or frees the customer to move on.`,
    severity: "HIGH",
    impactValue: value,
    evidence: stalled.map((d) => ({
      kind: "Job" as const,
      id: d.id,
      label: `${d.customer.name} — ${d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : d.dealType + " deal"}`,
      detail: `Open ${new Date(d.createdAt).toLocaleDateString()} · $${d.amount.toLocaleString()} · no follow-up recorded since`,
      amount: d.amount,
    })),
    reasoning:
      "Deals open longer than a weekend without contact rarely close on their own. CUE flags negotiations that have sat past the 48-hour follow-up policy.",
    confidence: 0.88,
    recommendation: {
      title: "Create an unsold-deal follow-up plan",
      action: "FOLLOW_UP_DEALS",
      rationale: "Systematic 48-hour follow-up is the highest-yield sales activity in retail automotive.",
      impact: `Work $${Math.round(value).toLocaleString()} of stalled pipeline`,
      impactValue: value,
      confidence: 0.75,
    },
  };
}

/** Completed service orders with no invoice. */
async function detectUnbilledServiceOrders(orgId: string): Promise<ComputedInsight | null> {
  const orders = await prisma.serviceOrder.findMany({
    where: { organizationId: orgId, status: "COMPLETED" },
    include: { customer: true },
  });
  const unbilled = orders.filter((o) => !o.invoicedAt);
  if (unbilled.length === 0) return null;
  const total = unbilled.reduce((s, o) => s + o.amount, 0);
  return {
    type: "REVENUE",
    title: `${unbilled.length} completed service order${unbilled.length === 1 ? "" : "s"} not yet invoiced`,
    summary: `Service work is done but the invoice has not gone out. Unbilled service revenue: $${Math.round(total).toLocaleString()}.`,
    severity: total > 1500 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: unbilled.map((o) => ({
      kind: "Job" as const,
      id: o.id,
      label: `${o.title} — ${o.customer.name}`,
      detail: `Completed ${o.completedAt ? new Date(o.completedAt).toLocaleDateString() : "recently"} · no invoice recorded`,
      amount: o.amount,
    })),
    reasoning:
      "Completed service orders should be invoiced within 24 hours per company policy. CUE matches completed orders against invoice records and found these gaps.",
    confidence: 0.96,
    recommendation: {
      title: "Bill all completed service orders",
      action: "BILL_SERVICE_ORDERS",
      rationale: "Billing same-day protects fixed-operations revenue and keeps DSO low.",
      impact: `Collect $${Math.round(total).toLocaleString()} in service revenue`,
      impactValue: total,
      confidence: 0.95,
    },
  };
}

/** Aging inventory: AVAILABLE vehicles listed 30+ days. */
async function detectAgedInventory(orgId: string): Promise<ComputedInsight | null> {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: orgId, status: "AVAILABLE" },
  });
  const aged = vehicles.filter(
    (v) => v.listedAt && Date.now() - new Date(v.listedAt).getTime() > 30 * 86_400_000
  );
  if (aged.length === 0) return null;
  const carrying = aged.reduce((s, v) => s + (v.cost ?? 0) * 0.0004 * 30, 0); // rough floorplan interest
  return {
    type: "OPERATIONS",
    title: `${aged.length} vehicle${aged.length === 1 ? "" : "s"} sitting unsold past 30 days`,
    summary: `Aging units accrue floorplan interest daily (roughly $22/day per unit) and lose market value. Estimated carrying cost so far: $${Math.round(carrying).toLocaleString()}+.`,
    severity: aged.length >= 3 ? "HIGH" : "MEDIUM",
    evidence: aged.map((v) => ({
      kind: "Job" as const,
      id: v.id,
      label: `${v.year} ${v.make} ${v.model} ${v.trim ?? ""} (${v.stockNumber})`,
      detail: `Listed ${v.listedAt ? new Date(v.listedAt).toLocaleDateString() : "unknown"} · $${(v.listPrice ?? 0).toLocaleString()} asking · $${(v.cost ?? 0).toLocaleString()} cost`,
      amount: v.listPrice ?? undefined,
    })),
    reasoning:
      "Dealership policy is a price review every Monday for units past 30 days. CUE compares listedAt dates against today and flags units past that threshold.",
    confidence: 0.9,
    recommendation: {
      title: "Run a price review on aging inventory",
      action: "PRICE_REVIEW_AGED",
      rationale: "Movement on aged units frees floorplan capital and stops the daily interest bleed.",
      impact: "Free up capital and stop carrying-cost losses",
      confidence: 0.7,
    },
  };
}

/** Run all detectors and persist new insights + linked recommendations. */
export async function refreshIntelligence(orgId: string) {
  const detectors = [
    detectUnbilledJobs,
    detectEstimateLeakage,
    detectOverdueInvoices,
    detectNeglectedPlanCustomers,
    detectMissedLeads,
    detectStalledDeals,
    detectUnbilledServiceOrders,
    detectAgedInventory,
  ];

  let created = 0;
  for (const detect of detectors) {
    const insight = await detect(orgId);
    if (!insight) continue;

    const fingerprint = insight.title;
    // Dedupe on fingerprint in ANY status: if CUE already flagged it
    // (or the user dismissed / acted on it), do not nag again until the
    // underlying records actually change the picture.
    const existing = await prisma.insight.findFirst({
      where: { organizationId: orgId, title: fingerprint },
    });
    if (existing) continue;

    const rec = insight.recommendation
      ? await prisma.recommendation.create({
          data: {
            organizationId: orgId,
            title: insight.recommendation.title,
            action: insight.recommendation.action,
            rationale: insight.recommendation.rationale,
            impact: insight.recommendation.impact,
            impactValue: insight.recommendation.impactValue,
            confidence: insight.recommendation.confidence,
          },
        })
      : null;

    const createdInsight = await prisma.insight.create({
      data: {
        organizationId: orgId,
        type: insight.type,
        title: insight.title,
        summary: insight.summary,
        severity: insight.severity,
        impactValue: insight.impactValue,
        evidence: JSON.stringify(insight.evidence),
        reasoning: insight.reasoning,
        confidence: insight.confidence,
        recId: rec?.id,
      },
    });

    if (rec) {
      await prisma.recommendation.update({
        where: { id: rec.id },
        data: { insightId: createdInsight.id },
      });
    }

    await logAudit({
      organizationId: orgId,
      actorType: "AI",
      action: "INSIGHT_GENERATED",
      targetType: "Insight",
      detail: fingerprint,
      metadata: {
        evidenceCount: insight.evidence.length,
        impactValue: insight.impactValue,
      },
    });
    created++;
  }
  return created;
}

export async function parseEvidence(raw: string): Promise<EvidenceRef[]> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
