"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function setAiPermissions(
  perms: { observe: boolean; recommend: boolean; prepare: boolean; execute: boolean; automate: boolean }
) {
  const session = await requireSessionAction();

  await prisma.aiSettings.upsert({
    where: { organizationId: session.organizationId },
    update: perms,
    create: { organizationId: session.organizationId, ...perms },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "AI_PERMISSIONS_CHANGED",
    targetType: "AiSettings",
    detail: `Observe: ${perms.observe}, Recommend: ${perms.recommend}, Prepare: ${perms.prepare}, Execute: ${perms.execute}, Automate: ${perms.automate}`,
    metadata: perms,
  });

  return { ok: true };
}
