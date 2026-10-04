import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import CaptureClient from "./CaptureClient";
import ImportClient from "./ImportClient";
import DocumentManager from "./DocumentManager";

export default async function CapturePage() {
  const session = await requireSession();
  const [documents, departments, knowledgePerDoc] = await Promise.all([
    prisma.document.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.department.findMany({ where: { organizationId: session.organizationId } }),
    prisma.knowledgeItem.groupBy({
      by: ["documentId"],
      where: { organizationId: session.organizationId, documentId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const kCount = new Map(knowledgePerDoc.map((k) => [k.documentId, k._count._all]));
  const knowledgeCount = await prisma.knowledgeItem.count({
    where: { organizationId: session.organizationId },
  });

  return (
    <AppShell crumb="Capture">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Capture</h1>
          <p className="muted mt-1">
            Bring information into CUE. Everything is classified, extracted, organized and made searchable — never dumped into a folder.
            {knowledgeCount > 0 && ` ${knowledgeCount} knowledge items have been extracted so far.`}
          </p>
        </div>

        <CaptureClient />

        <ImportClient />

        <DocumentManager
          docs={documents.map((d) => ({
            id: d.id,
            title: d.title,
            fileName: d.fileName,
            kind: d.kind,
            status: d.status,
            extractedText: d.extractedText,
            departmentId: d.departmentId,
            uploadedAt: d.uploadedAt.toISOString(),
            knowledgeCount: kCount.get(d.id) ?? 0,
          }))}
          departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        />
      </div>
    </AppShell>
  );
}
