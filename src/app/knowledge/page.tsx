import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import KnowledgeClient from "./KnowledgeClient";

export default async function KnowledgePage() {
  const session = await requireSession();
  const items = await prisma.knowledgeItem.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { updatedAt: "desc" },
    include: { document: { select: { title: true } } },
  });

  return (
    <AppShell crumb="Knowledge">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Knowledge</h1>
          <p className="muted mt-1">The company's institutional memory — every answer traceable to the information it came from.</p>
        </div>
        <KnowledgeClient
          items={items.map((k) => ({
            id: k.id,
            title: k.title,
            content: k.content,
            category: k.category,
            tags: k.tags,
            status: k.status,
            sourceDoc: k.document?.title ?? null,
            updatedAt: k.updatedAt.toISOString(),
          }))}
        />
      </div>
    </AppShell>
  );
}
