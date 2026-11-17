"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const CHANNELS = ["GOOGLE", "SMS", "EMAIL", "IN_PERSON"];

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
