import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import UnderstandClient from "./UnderstandClient";

export default async function UnderstandPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [insights, entities, facts, knowledgeCount, docCount] = await Promise.all([
    prisma.insight.findMany({
      where: { organizationId: orgId },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
      include: { recommendations: { take: 1 } },
    }),
    prisma.entity.findMany({
      where: { organizationId: orgId },
      include: { facts: true },
      orderBy: { name: "asc" },
      take: 12,
    }),
    prisma.fact.count({ where: { organizationId: orgId, status: "FACT" } }),
    prisma.knowledgeItem.count({ where: { organizationId: orgId } }),
    prisma.document.count({ where: { organizationId: orgId } }),
  ]);

  return (
    <AppShell crumb="Understand">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Understand</h1>
          <p className="muted mt-1">
            The intelligence layer: {docCount} captured sources → {knowledgeCount} knowledge items → {entities.length}+ entities → {insights.length} active insight{insights.length === 1 ? "" : "s"}. Every insight links to its evidence.
          </p>
        </div>

        <UnderstandClient
          insights={insights.map((i) => ({
            id: i.id,
            title: i.title,
            summary: i.summary,
            severity: i.severity,
            type: i.type,
            impactValue: i.impactValue,
            confidence: i.confidence,
            status: i.status,
            recId: i.recId,
          }))}
          entities={entities.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            description: e.description,
            facts: e.facts.map((f) => ({
              id: f.id,
              statement: f.statement,
              status: f.status,
              confidence: f.confidence,
            })),
          }))}
          counts={{ facts: facts, knowledge: knowledgeCount, documents: docCount }}
        />
      </div>
    </AppShell>
  );
}
