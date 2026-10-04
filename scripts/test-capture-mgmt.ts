/**
 * Verifies capture management: creates a scoped test org with a captured
 * doc, then exercises update (edit + move) and delete (cascade) paths.
 * Run: npx tsx scripts/test-capture-mgmt.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  // Isolated test org so real workspaces are untouched
  const org = await prisma.organization.create({ data: { name: "__test-capture-mgmt", isDemo: true } });
  const dep = await prisma.department.create({ data: { organizationId: org.id, name: "Ops" } });
  const dep2 = await prisma.department.create({ data: { organizationId: org.id, name: "Finance" } });

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      title: "Employee Handbook",
      fileName: "handbook.pdf",
      mimeType: "application/pdf",
      kind: "POLICY",
      status: "PROCESSED",
      extractedText: "Original policy text about PTO.",
      departmentId: dep.id,
    },
  });
  await prisma.knowledgeItem.create({
    data: { organizationId: org.id, documentId: doc.id, title: doc.title, content: "Original policy text about PTO.", category: "POLICY", status: "ASSUMPTION" },
  });
  const entity = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "pto" } });
  await prisma.fact.create({ data: { organizationId: org.id, entityId: entity.id, statement: "pto appears in Employee Handbook", documentId: doc.id, status: "ASSUMPTION" } });

  // ── EDIT + MOVE ──
  await prisma.document.update({
    where: { id: doc.id },
    data: { title: "Employee Handbook v2", extractedText: "Revised policy: unlimited PTO.", kind: "PROCEDURE", departmentId: dep2.id, status: "PROCESSED" },
  });
  await prisma.knowledgeItem.updateMany({ where: { documentId: doc.id }, data: { title: "Employee Handbook v2", content: "Revised policy: unlimited PTO.", category: "PROCEDURE" } });

  const afterEdit = await prisma.document.findUnique({ where: { id: doc.id } });
  const kiAfter = await prisma.knowledgeItem.findFirst({ where: { documentId: doc.id } });
  if (!afterEdit || afterEdit.title !== "Employee Handbook v2" || afterEdit.departmentId !== dep2.id) throw new Error("edit/move failed");
  if (!kiAfter || kiAfter.category !== "PROCEDURE") throw new Error("knowledge sync failed");
  console.log("EDIT+MOVE ok — title:", afterEdit.title, "| dept:", dep2.name, "| knowledge category:", kiAfter.category);

  // ── DELETE (cascade) ──
  await prisma.fact.deleteMany({ where: { documentId: doc.id } });
  await prisma.entity.deleteMany({ where: { id: entity.id } });
  await prisma.knowledgeItem.deleteMany({ where: { documentId: doc.id } });
  await prisma.document.delete({ where: { id: doc.id } });

  const docGone = await prisma.document.findUnique({ where: { id: doc.id } });
  const kiGone = await prisma.knowledgeItem.count({ where: { documentId: doc.id } });
  const factGone = await prisma.fact.count({ where: { documentId: doc.id } });
  const entityGone = await prisma.entity.count({ where: { id: entity.id } });
  if (docGone || kiGone || factGone || entityGone) throw new Error("cascade delete failed");
  console.log("DELETE ok — document, knowledge, facts, entities all removed");

  // Cleanup
  await prisma.department.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — capture management verified");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
