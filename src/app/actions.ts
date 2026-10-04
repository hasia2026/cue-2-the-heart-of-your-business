"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createWorkflowFromRecommendation } from "@/lib/workflows";
import { refreshIntelligence } from "@/lib/intelligence";

export type DecisionKind = "APPROVED" | "REJECTED" | "MODIFIED" | "DEFERRED";

/** Record a human decision on a recommendation. */
export async function decideRecommendation(recId: string, decision: DecisionKind, note?: string) {
  const session = await requireSessionAction();
  const rec = await prisma.recommendation.findUnique({ where: { id: recId } });
  if (!rec || rec.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.recommendation.update({
    where: { id: recId },
    data: { status: decision, decidedAt: new Date(), decidedById: session.user.id },
  });

  if (rec.insightId && decision !== "DEFERRED") {
    await prisma.insight.update({
      where: { id: rec.insightId },
      data: { status: decision === "REJECTED" ? "DISMISSED" : "ACTION_TAKEN" },
    }).catch(() => {});
  }

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: `RECOMMENDATION_${decision}`,
    targetType: "Recommendation",
    targetId: recId,
    detail: note ? `${rec.title} — with note: ${note}` : rec.title,
    metadata: { decision, previousStatus: rec.status },
  });

  revalidatePath("/dashboard");
  revalidatePath("/understand");
  revalidatePath("/execute");
  return { ok: true };
}

/** Convert an approved recommendation into a concrete workflow with tasks. */
export async function createWorkflowFromRec(recId: string) {
  const session = await requireSessionAction();
  const result = await createWorkflowFromRecommendation(
    session.organizationId,
    session.user.id,
    recId
  );
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  revalidatePath("/execute");
  return result;
}

/** Mark an insight dismissed without rejecting its recommendation. */
export async function dismissInsight(insightId: string, note?: string) {
  const session = await requireSessionAction();
  const insight = await prisma.insight.findUnique({ where: { id: insightId } });
  if (!insight || insight.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.insight.update({ where: { id: insightId }, data: { status: "DISMISSED" } });
  if (insight.recId) {
    await prisma.recommendation.update({
      where: { id: insight.recId },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: session.user.id },
    }).catch(() => {});
  }

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "INSIGHT_DISMISSED",
    targetType: "Insight",
    targetId: insightId,
    detail: note ? `${insight.title} — ${note}` : insight.title,
  });

  revalidatePath("/dashboard");
  revalidatePath("/understand");
  return { ok: true };
}

export async function completeTask(taskId: string) {
  const session = await requireSessionAction();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== session.organizationId) throw new Error("Not found");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "DONE", completedAt: new Date() },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "TASK_COMPLETED",
    targetType: "Task",
    targetId: taskId,
    detail: task.title,
  });

  revalidatePath("/execute");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function refreshInsights() {
  const session = await requireSessionAction();
  const created = await refreshIntelligence(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "INTELLIGENCE_REFRESHED",
    detail: `${created} new insight(s) computed from current data`,
  });
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  return { created };
}
