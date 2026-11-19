"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const CHANNELS = ["GOOGLE", "SMS", "EMAIL", "IN_PERSON"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function customerForOrg(orgId: string, raw: string): Promise<string | null> {
  if (!raw) return null;
  const [c] = await sql`select id from customers where id = ${raw} and organization_id = ${orgId}`;
  return c ? (c.id as string) : null;
}

export async function requestReview(fd: FormData) {
  const session = await requireSessionAction();
  const customerId = await customerForOrg(session.organizationId, String(fd.get("customerId") ?? "").trim());
  if (!customerId) throw new Error("Choose a client first.");
  const channel = CHANNELS.includes(String(fd.get("channel"))) ? String(fd.get("channel")) : "GOOGLE";
  await sql`
    insert into reviews (organization_id, customer_id, channel, status, requested_at)
    values (${session.organizationId}, ${customerId}, ${channel}, 'REQUESTED', now())`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "REVIEW_REQUESTED", targetType: "Customer", targetId: customerId, detail: `Review request via ${channel}`,
  });
  revalidatePath("/expand/reviews");
}

export async function updateReview(fd: FormData) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can edit reviews.");
  const id = String(fd.get("id") ?? "").trim();
  if (!UUID_RE.test(id)) throw new Error("Review not found");
  const [review] = await sql`
    select id, status from reviews
    where id = ${id} and organization_id = ${session.organizationId}`;
  if (!review) throw new Error("Review not found");

  const customerId = await customerForOrg(session.organizationId, String(fd.get("customerId") ?? "").trim());
  const rawRating = Number(fd.get("rating"));
  const rating = Number.isFinite(rawRating) && rawRating >= 1 && rawRating <= 5 ? Math.round(rawRating) : null;
  const channel = CHANNELS.includes(String(fd.get("channel"))) ? String(fd.get("channel")) : "GOOGLE";
  const comment = String(fd.get("comment") ?? "").trim() || null;
  if (!rating && !comment) return;

  const received = review.status === "RECEIVED" || rating != null;
  await sql`
    update reviews
    set customer_id = ${customerId}, rating = ${rating}, channel = ${channel}, comment = ${comment},
        status = ${received ? "RECEIVED" : "REQUESTED"},
        received_at = case when ${received} then coalesce(received_at, now()) else null end
    where id = ${review.id} and organization_id = ${session.organizationId}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "REVIEW_UPDATED", targetType: "Review", targetId: String(review.id),
    detail: rating ? `Review updated — ${rating}★` : "Review updated",
  });
  revalidatePath("/expand/reviews");
}

export async function deleteReview(fd: FormData) {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can delete reviews.");
  const id = String(fd.get("id") ?? "").trim();
  if (!UUID_RE.test(id)) throw new Error("Review not found");
  const [review] = await sql`
    select id, rating, comment from reviews
    where id = ${id} and organization_id = ${session.organizationId}`;
  if (!review) throw new Error("Review not found");
  await sql`delete from reviews where id = ${review.id} and organization_id = ${session.organizationId}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "REVIEW_DELETED", targetType: "Review", targetId: String(review.id),
    detail: review.rating ? `Review deleted — ${review.rating}★` : "Review request deleted",
  });
  revalidatePath("/expand/reviews");
}

export async function logReview(fd: FormData) {
  const session = await requireSessionAction();
  const customerId = await customerForOrg(session.organizationId, String(fd.get("customerId") ?? "").trim());
  const rawRating = Number(fd.get("rating"));
  const rating = Number.isFinite(rawRating) && rawRating >= 1 && rawRating <= 5 ? Math.round(rawRating) : null;
  const channel = CHANNELS.includes(String(fd.get("channel"))) ? String(fd.get("channel")) : "GOOGLE";
  const comment = String(fd.get("comment") ?? "").trim() || null;
  if (!rating && !comment) return;
  await sql`
    insert into reviews (organization_id, customer_id, rating, channel, comment, status, requested_at, received_at)
    values (${session.organizationId}, ${customerId}, ${rating}, ${channel}, ${comment}, 'RECEIVED', now(), now())`;
  revalidatePath("/expand/reviews");
}
