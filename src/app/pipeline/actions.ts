"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { setLeadStatus, setDealStage, logLeadContact, logCustomerContact } from "@/lib/crm";

function refresh() {
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}

export async function setLeadStatusAction(leadId: string, status: string) {
  const session = await requireSessionAction();
  await setLeadStatus(session.organizationId, leadId, status as "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST", session.user.id);
  refresh();
  return { ok: true };
}

export async function setDealStageAction(dealId: string, stage: string) {
  const session = await requireSessionAction();
  await setDealStage(session.organizationId, dealId, stage as "NEGOTIATING" | "PENDING_FINANCE" | "WON" | "LOST", session.user.id);
  refresh();
  return { ok: true };
}

export async function logLeadContactAction(
  leadId: string,
  input: { channel: string; direction?: string; summary: string; customerName?: string; email?: string; phone?: string }
) {
  const session = await requireSessionAction();
  const result = await logLeadContact(session.organizationId, leadId, {
    channel: input.channel as "PHONE" | "EMAIL" | "SMS" | "IN_PERSON",
    direction: input.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
    summary: input.summary,
    customerName: input.customerName,
    email: input.email,
    phone: input.phone,
  }, session.user.id);
  refresh();
  return result;
}

export async function logCustomerContactAction(
  customerId: string,
  input: { channel: string; direction?: string; summary: string }
) {
  const session = await requireSessionAction();
  await logCustomerContact(session.organizationId, customerId, {
    channel: input.channel as "PHONE" | "EMAIL" | "SMS" | "IN_PERSON",
    direction: input.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
    summary: input.summary,
  }, session.user.id);
  refresh();
  return { ok: true };
}
