"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/** Employee (or owner on behalf) acknowledges a policy document. */
export async function acknowledgePolicy(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const documentId = String(formData.get("documentId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const signature = String(formData.get("signature") ?? "").trim();

  if (!documentId || !employeeId || signature.length < 2) {
    throw new Error("Employee, document, and typed signature are required");
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId: orgId },
  });
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: orgId },
  });
  if (!doc || !emp) throw new Error("Not found");

  await prisma.policyAcknowledgment.upsert({
    where: { documentId_employeeId: { documentId, employeeId } },
    create: {
      organizationId: orgId,
      documentId,
      employeeId,
      signature,
      documentVersion: doc.uploadedAt.toISOString(),
    },
    update: {
      acknowledgedAt: new Date(),
      signature,
      documentVersion: doc.uploadedAt.toISOString(),
    },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "POLICY_ACKNOWLEDGED",
    targetType: "Document",
    targetId: documentId,
    detail: `${emp.name} acknowledged "${doc.title}" (signed: ${signature})`,
  });

  revalidatePath("/people");
  return { ok: true };
}
