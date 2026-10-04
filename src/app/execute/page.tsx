import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { computeImpactReceipts } from "@/lib/impact";
import AppShell from "@/components/AppShell";
import ExecuteClient from "./ExecuteClient";

export default async function ExecutePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [tasks, workflows, projects, receipts] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: orgId },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueAt: "asc" }],
      include: { customer: true, assignee: true, workflow: true },
      take: 80,
    }),
    prisma.workflow.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: true } }, rec: { select: { title: true } } },
    }),
    prisma.project.findMany({ where: { organizationId: orgId }, orderBy: { dueAt: "asc" } }),
    computeImpactReceipts(orgId),
  ]);

  return (
    <AppShell crumb="Execute">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Execute</h1>
          <p className="muted mt-1">Decisions become actions here. Every workflow traces back to the recommendation and evidence that created it.</p>
        </div>

        <ExecuteClient
          receipts={receipts}
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            detail: t.detail,
            status: t.status,
            priority: t.priority,
            dueAt: t.dueAt?.toISOString() ?? null,
            customer: t.customer?.name ?? null,
            assignee: t.assignee?.name ?? null,
            workflowTitle: t.workflow?.title ?? null,
            origin: t.origin,
          }))}
          workflows={workflows.map((w) => ({
            id: w.id,
            title: w.title,
            kind: w.kind,
            status: w.status,
            source: w.source,
            taskCount: w._count.tasks,
            recTitle: w.rec?.title ?? null,
            createdAt: w.createdAt.toISOString(),
          }))}
          projects={projects.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status,
            dueAt: p.dueAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </AppShell>
  );
}
