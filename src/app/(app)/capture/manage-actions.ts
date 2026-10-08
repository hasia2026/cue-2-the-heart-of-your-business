"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Every captured document can be viewed, edited, moved, shared, or deleted.
// All actions are org-scoped and audited; delete/move are OWNER/ADMIN only
// (MEMBER keeps view + share, matching the app's role-gate pattern).

async function ownedDoc(orgId: string, docId: string) {
  const [doc] = await sql`select id, title from documents where id = ${docId} and organization_id = ${orgId}`;
  if (!doc) throw new Error("Document not found in your organization.");
  return doc;
}

function canManage(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function renameDocument(docId: string, title: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only Owners and Admins can rename documents." };
  const clean = title.trim();
  if (!clean) return { ok: false, error: "Title cannot be empty." };
  const doc = await ownedDoc(session.organizationId, docId);
  await sql`update documents set title = ${clean.slice(0, 200)} where id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_RENAMED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" → "${clean.slice(0, 200)}"` });
  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ok: true };
}

export async function moveDocument(docId: string, departmentId: string | null): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only Owners and Admins can move documents." };
  const doc = await ownedDoc(session.organizationId, docId);
  let dept: string | null = null;
  if (departmentId) {
    const [d] = await sql`select id, name from departments where id = ${departmentId} and organization_id = ${session.organizationId}`;
    if (!d) return { ok: false, error: "Department not found in your organization." };
    dept = d.name;
  }
  await sql`update documents set department_id = ${departmentId} where id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_MOVED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" moved to ${dept ?? "Unfiled"}` });
  revalidatePath("/capture");
  return { ok: true };
}

export async function editDocumentText(docId: string, extractedText: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only Owners and Admins can edit document content." };
  const doc = await ownedDoc(session.organizationId, docId);
  await sql`update documents set extracted_text = ${extractedText.slice(0, 20000)} where id = ${doc.id}`;
  await sql`update knowledge_items set content = ${extractedText.slice(0, 20000)} where document_id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_EDITED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" content edited` });
  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ok: true };
}

export async function deleteDocument(docId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only Owners and Admins can delete documents." };
  const doc = await ownedDoc(session.organizationId, docId);
  // knowledge_items.document_id is ON DELETE SET NULL — knowledge survives, source link drops.
  await sql`delete from documents where id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_DELETED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" deleted` });
  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ok: true };
}

export async function shareDocument(docId: string, days: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await requireSessionAction();
  const doc = await ownedDoc(session.organizationId, docId);
  const ttlDays = Math.min(Math.max(Math.round(days) || 7, 1), 30);
  const token = randomUUID();
  await sql`update documents set share_token = ${token}, share_expires = now() + (${ttlDays} * interval '1 day') where id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_SHARED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" shared for ${ttlDays} day(s)` });
  const base = (process.env.APP_URL || "http://localhost:3210").replace(/\/$/, "");
  return { ok: true, url: `${base}/shared/${token}` };
}

export async function revokeShare(docId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  const doc = await ownedDoc(session.organizationId, docId);
  await sql`update documents set share_token = null, share_expires = null where id = ${doc.id}`;
  await logAudit({ organizationId: session.organizationId, actorId: session.user.id, action: "DOCUMENT_SHARE_REVOKED", targetType: "Document", targetId: doc.id, detail: `"${doc.title}" share link revoked` });
  revalidatePath("/capture");
  return { ok: true };
}
