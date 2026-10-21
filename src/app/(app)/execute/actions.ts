"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createWorkflowFromRecommendation } from "@/lib/workflows";

export async function completeTask(taskId: string) {
  const session = await requireSessionAction();
  const [task] = await sql`select id, title from tasks where id = ${taskId} and organization_id = ${session.organizationId}`;
  if (!task) throw new Error("Not found");
  await sql`update tasks set status = 'DONE', completed_at = now() where id = ${taskId}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "TASK_COMPLETED", targetType: "Task", targetId: taskId, detail: task.title,
  });
  revalidatePath("/execute");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function decideRec(recId: string, decision: "APPROVED" | "REJECTED") {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only owners and admins can decide approvals.");
  const [rec] = await sql`select id, title, insight_id from recommendations where id = ${recId} and organization_id = ${session.organizationId}`;
  if (!rec) throw new Error("Not found");
  await sql`update recommendations set status = ${decision}, decided_at = now(), decided_by = ${session.user.id} where id = ${recId}`;
  if (rec.insight_id) {
    await sql`update insights set status = ${decision === "REJECTED" ? "DISMISSED" : "ACTION_TAKEN"} where id = ${rec.insight_id}`;
  }
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: `RECOMMENDATION_${decision}`, targetType: "Recommendation", targetId: recId, detail: rec.title,
  });
  revalidatePath("/execute");
  revalidatePath("/enhance");
  revalidatePath("/understand");

  // Stopping at a log row left approved decisions parked until someone found
  // the “Create workflow” button. Approving now immediately generates the
  // follow-up artifacts — workflow + data-driven tasks with owners and
  // deadlines — exactly the manual generator's behavior. EXECUTING each task
  // still needs a human, so the human-in-control guarantee is unchanged.
  let taskCount: number | undefined;
  if (decision === "APPROVED") {
    const result = await createWorkflowFromRecommendation(session.organizationId, session.user.id, recId);
    if (result.ok) taskCount = result.taskCount ?? 0;
  }
  return { ok: true, taskCount };
}

export async function generateWorkflow(recId: string) {
  const session = await requireSessionAction();
  const result = await createWorkflowFromRecommendation(session.organizationId, session.user.id, recId);
  revalidatePath("/execute");
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  if (!result.ok) throw new Error(result.error ?? "Could not create workflow");
  return result;
}
