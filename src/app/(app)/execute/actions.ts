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

export async function generateWorkflow(recId: string) {
  const session = await requireSessionAction();
  const result = await createWorkflowFromRecommendation(session.organizationId, session.user.id, recId);
  revalidatePath("/execute");
  revalidatePath("/dashboard");
  revalidatePath("/understand");
  if (!result.ok) throw new Error(result.error ?? "Could not create workflow");
  return result;
}
