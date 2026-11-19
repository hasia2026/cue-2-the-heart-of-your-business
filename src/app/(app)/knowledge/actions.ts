"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  "POLICY", "PROCEDURE", "DECISION", "LESSON",
  "CUSTOMER", "PRODUCT", "HISTORY", "STRATEGY",
]);
const STATUSES = new Set(["FACT", "ASSUMPTION", "RECOMMENDATION", "DECISION"]);

function canManage(role: string): boolean {
  return role !== "MEMBER";
}

export async function updateKnowledge(fd: FormData): Promise<void> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return;

  const id = String(fd.get("id") ?? "").trim();
  if (!UUID_RE.test(id)) return;
  const title = String(fd.get("title") ?? "").trim();
  const content = String(fd.get("content") ?? "").trim();
  const category = String(fd.get("category") ?? "");
  const status = String(fd.get("status") ?? "");
  const tags = String(fd.get("tags") ?? "").trim() || null;
  if (!title || !content || !CATEGORIES.has(category) || !STATUSES.has(status)) return;

  const [item] = await sql`
    select id, title from knowledge_items
    where id = ${id} and organization_id = ${session.organizationId}`;
  if (!item) return;

  await sql`
    update knowledge_items
    set title = ${title}, content = ${content}, category = ${category},
        tags = ${tags}, status = ${status}, updated_at = now()
    where id = ${item.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "KNOWLEDGE_UPDATED",
    targetType: "KnowledgeItem",
    targetId: String(item.id),
    detail: `"${title}" updated`,
  });
  revalidatePath("/knowledge");
  revalidatePath("/understand");
}

export async function deleteKnowledge(fd: FormData): Promise<void> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return;

  const id = String(fd.get("id") ?? "").trim();
  if (!UUID_RE.test(id)) return;
  const [item] = await sql`
    select id, title from knowledge_items
    where id = ${id} and organization_id = ${session.organizationId}`;
  if (!item) return;

  await sql`delete from knowledge_items where id = ${item.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "KNOWLEDGE_DELETED",
    targetType: "KnowledgeItem",
    targetId: String(item.id),
    detail: `"${item.title}" deleted`,
  });
  revalidatePath("/knowledge");
  revalidatePath("/understand");
}
