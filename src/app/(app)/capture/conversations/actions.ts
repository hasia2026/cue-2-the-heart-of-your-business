"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function logConversation(fd: FormData) {
  const session = await requireSessionAction();
  const customerId = String(fd.get("customerId") ?? "").trim();
  const summary = String(fd.get("summary") ?? "").trim();
  if (!customerId || !summary) return;

  const [customer] = await sql`select id, name from customers where id = ${customerId} and organization_id = ${session.organizationId}`;
  if (!customer) throw new Error("Customer not found");

  const channel = ["PHONE", "SMS", "EMAIL", "IN_PERSON"].includes(String(fd.get("channel")))
    ? String(fd.get("channel")) : "PHONE";
  const direction = String(fd.get("direction")) === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

  await sql`
    insert into communications (organization_id, customer_id, channel, direction, summary)
    values (${session.organizationId}, ${customerId}, ${channel}, ${direction}, ${summary})`;

  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "CONVERSATION_LOGGED", targetType: "Customer", targetId: customerId,
    detail: `${direction} ${channel}: ${summary.slice(0, 120)}`,
  });

  revalidatePath("/capture/conversations");
  revalidatePath("/dashboard");
}
