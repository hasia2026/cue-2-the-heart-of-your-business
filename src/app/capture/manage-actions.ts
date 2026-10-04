"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// Document management: view / edit / move / delete captured items.
// Every mutation is org-scoped and audit-logged. Deleting a
// document also removes the knowledge item and the assumption
// facts/entities extracted from it — no orphaned knowledge.
// ─────────────────────────────────────────────────────────────

const KINDS = ["POLICY", "PROCEDURE", "CONTRACT", "RECORD", "NOTE", "SPREADSHEET", "MEDIA", "OTHER"] as const;

export async function updateDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const extractedText = String(formData.get("extractedText") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "OTHER");
  const departmentId = String(formData.get("departmentId") ?? "");

  if (!id || !title) throw new Error("Missing id or title");
  if (!KINDS.includes(kindRaw as (typeof KINDS)[number])) throw new Error("Invalid kind");

  const before = await prisma.document.findFirst({
    where: { id, organizationId: orgId },
    include: { knowledge: true },
  });
  if (!before) throw new Error("Document not found");

  await prisma.document.update({
    where: { id },
    data: {
      title,
      extractedText: extractedText || null,
      kind: kindRaw,
      departmentId: departmentId || null,
      // Editing the text invalidates the old extraction — keep status honest
      status: "PROCESSED",
    },
  });

  // Keep the linked knowledge item in sync (it powers search + CUE AI)
  if (before.knowledge.length > 0) {
    await prisma.knowledgeItem.updateMany({
      where: { documentId: id, organizationId: orgId },
      data: {
        title,
        content: extractedText || before.knowledge[0].content,
        category: kindRaw === "POLICY" ? "POLICY" : kindRaw === "PROCEDURE" ? "PROCEDURE" : before.knowledge[0].category,
      },
    });
  }

  const changes: string[] = [];
  if (before.title !== title) changes.push(`title → "${title}"`);
  if (before.kind !== kindRaw) changes.push(`kind → ${kindRaw}`);
  if ((before.departmentId ?? "") !== departmentId) changes.push(departmentId ? "department moved" : "department cleared");
  if ((before.extractedText ?? "") !== extractedText) changes.push("text edited");

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_UPDATED",
    targetType: "Document",
    targetId: id,
    detail: changes.length ? changes.join(", ") : "No content change",
  });

  return { ok: true };
}

export async function deleteDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");

  const doc = await prisma.document.findFirst({
    where: { id, organizationId: orgId },
    include: { knowledge: true },
  });
  if (!doc) throw new Error("Document not found");

  // Remove extracted assumption entities/facts that came from this document
  const facts = await prisma.fact.findMany({
    where: { organizationId: orgId, documentId: id },
    select: { entityId: true },
  });
  const entityIds = [...new Set(facts.map((f) => f.entityId))];
  await prisma.fact.deleteMany({ where: { organizationId: orgId, documentId: id } });
  for (const eid of entityIds) {
    const remaining = await prisma.fact.count({ where: { entityId: eid } });
    if (remaining === 0) await prisma.entity.deleteMany({ where: { id: eid, organizationId: orgId } });
  }

  // Remove knowledge items sourced from this document
  await prisma.knowledgeItem.deleteMany({ where: { organizationId: orgId, documentId: id } });

  await prisma.document.delete({ where: { id } });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_DELETED",
    targetType: "Document",
    targetId: id,
    detail: `"${doc.title}" deleted along with ${doc.knowledge.length} linked knowledge item(s)${entityIds.length ? ` and ${entityIds.length} extracted entity/entities` : ""}`,
  });

  return { ok: true };
}
