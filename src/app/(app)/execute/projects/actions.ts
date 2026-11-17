"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function when(fd: FormData, key: string): Date | null {
  const v = text(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createProject(fd: FormData) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can create projects.");
  const title = text(fd, "title");
  if (!title) return;
  const [row] = await sql`
    insert into projects (organization_id, title, description, due_at)
    values (${session.organizationId}, ${title}, ${text(fd, "description") || null}, ${when(fd, "dueAt")})
    returning id`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "PROJECT_CREATED", targetType: "Project", targetId: row.id, detail: title,
  });
  revalidatePath("/execute/projects");
  revalidatePath("/execute");
}

export async function addProjectTask(fd: FormData) {
  const session = await requireSessionAction();
  const projectId = text(fd, "projectId");
  const title = text(fd, "title");
  if (!projectId || !title) return;
  const [project] = await sql`select id from projects where id = ${projectId} and organization_id = ${session.organizationId}`;
  if (!project) throw new Error("Project not found");

  let assigneeId: string | null = text(fd, "assigneeId") || null;
  if (assigneeId) {
    const [emp] = await sql`select id from employees where id = ${assigneeId} and organization_id = ${session.organizationId}`;
    if (!emp) assigneeId = null;
  }
  const priority = ["HIGH", "MEDIUM", "LOW"].includes(text(fd, "priority")) ? text(fd, "priority") : "MEDIUM";

  await sql`
    insert into tasks (organization_id, project_id, title, priority, assignee_id, due_at, origin)
    values (${session.organizationId}, ${projectId}, ${title}, ${priority}, ${assigneeId}, ${when(fd, "dueAt")}, 'MANUAL')`;
  revalidatePath("/execute/projects");
  revalidatePath("/execute");
}

export async function completeProjectTask(fd: FormData) {
  const session = await requireSessionAction();
  const taskId = text(fd, "taskId");
  if (!taskId) return;
  const [task] = await sql`select id, title from tasks where id = ${taskId} and organization_id = ${session.organizationId}`;
  if (!task) throw new Error("Task not found");
  await sql`update tasks set status = 'DONE', completed_at = now() where id = ${taskId}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "TASK_COMPLETED", targetType: "Task", targetId: taskId, detail: task.title,
  });
  revalidatePath("/execute/projects");
  revalidatePath("/execute");
}

export async function closeProject(fd: FormData) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can close projects.");
  const projectId = text(fd, "projectId");
  if (!projectId) return;
  await sql`update projects set status = 'COMPLETED' where id = ${projectId} and organization_id = ${session.organizationId}`;
  revalidatePath("/execute/projects");
  revalidatePath("/execute");
}
