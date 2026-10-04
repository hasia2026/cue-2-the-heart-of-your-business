import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { computeHealth } from "@/lib/health";
import { computeMoneyOnTheTable } from "@/lib/impact";
import { computeBriefing } from "@/lib/briefing";
import AppShell from "@/components/AppShell";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [insights, recs, tasks, audit, profile, health, money, briefing,
    captureCount, knowledgeCount, peopleCount, trainingCount, brandCount, autoCount, ecoCount] =
    await Promise.all([
      prisma.insight.findMany({
        where: { organizationId: orgId },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      }),
      prisma.recommendation.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { insight: { select: { id: true } } },
      }),
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        orderBy: [{ priority: "asc" }, { dueAt: "asc" }],
        take: 8,
        include: { customer: true, assignee: true },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.businessProfile.findUnique({ where: { organizationId: orgId } }),
      computeHealth(orgId),
      computeMoneyOnTheTable(orgId),
      computeBriefing(orgId),
      // Real per-module activity counts → orbital node intensity
      prisma.document.count({ where: { organizationId: orgId } }),
      prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
      prisma.employee.count({ where: { organizationId: orgId } }),
      prisma.trainingAssignment.count({ where: { employee: { organizationId: orgId } } }),
      prisma.brandAsset.count({ where: { organizationId: orgId } }),
      prisma.workflow.count({ where: { organizationId: orgId } }),
      prisma.integration.count({ where: { organizationId: orgId, status: { in: ["DEMO", "CONNECTED"] } } }),
  ]);

  const openInsights = insights.filter((i) => i.status === "OPEN");
  const pendingRecs = recs.filter((r) => r.status === "PENDING");

  const orbitActivity = {
    capture: captureCount,
    knowledge: knowledgeCount,
    people: peopleCount,
    training: trainingCount,
    brand: brandCount,
    automations: autoCount,
    ecosystem: ecoCount,
    execute: tasks.length,
  };

  return (
    <AppShell crumb="Dashboard">
      <DashboardClient
        orgName={session.organizationName}
        orgIndustry={profile?.industry ?? null}
        healthScore={health.overall}
        moneyTotal={money.total}
        moneyBreakdown={money.breakdown.slice(0, 4).map((b) => ({ label: b.label, amount: b.amount }))}
        briefing={briefing}
        orbitActivity={orbitActivity}
        insights={openInsights.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          severity: i.severity,
          type: i.type,
          impactValue: i.impactValue,
          status: i.status,
          recId: i.recId,
        }))}
        pendingRecs={pendingRecs.map((r) => ({
          id: r.id,
          insightId: r.insight?.id ?? null,
          title: r.title,
          impact: r.impact,
          confidence: r.confidence,
        }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          customer: t.customer?.name ?? null,
          assignee: t.assignee?.name ?? null,
        }))}
        activity={audit.map((a) => ({
          id: a.id,
          actorType: a.actorType,
          detail: a.detail ?? a.action,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </AppShell>
  );
}
