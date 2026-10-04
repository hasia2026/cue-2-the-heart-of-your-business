import { prisma } from "./prisma";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────
// CRM core: response-time aging, lead/deal status transitions,
// least-loaded assignment, and contact logging. All org-scoped,
// all audit-logged. The dealership "15-minute rule" lives here
// so the inbox, the briefing, and signal conversion agree.
// ─────────────────────────────────────────────────────────────

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DEAL_STAGES = ["NEGOTIATING", "PENDING_FINANCE", "WON", "LOST"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const RESPONSE_TARGET_MIN = 15;

/** 15-minute rule state for a lead that has not been contacted yet. */
export function responseState(createdAt: Date, lastContactAt: Date | null): "handled" | "due" | "late" {
  if (lastContactAt) return "handled";
  const minutes = (Date.now() - createdAt.getTime()) / 60_000;
  return minutes <= RESPONSE_TARGET_MIN ? "due" : "late";
}

/** Who should take the next lead: fewest open leads, then fewest open tasks. */
export async function pickLeastLoadedAssignee(orgId: string): Promise<{ id: string; name: string } | null> {
  const employees = await prisma.employee.findMany({
    where: { organizationId: orgId, status: "ACTIVE" },
    select: { id: true, name: true, title: true },
  });
  if (employees.length === 0) return null;
  // Sales-titled staff first when the org has any (dealership); else everyone.
  const sales = employees.filter((e) => /sales|advisor|agent/i.test(e.title));
  const pool = sales.length > 0 ? sales : employees;

  const scored = await Promise.all(
    pool.map(async (e) => {
      const [openLeads, openTasks] = await Promise.all([
        prisma.lead.count({ where: { organizationId: orgId, assignedToId: e.id, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
        prisma.task.count({ where: { organizationId: orgId, assigneeId: e.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      ]);
      return { ...e, load: openLeads * 100 + openTasks };
    })
  );
  scored.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
  return { id: scored[0].id, name: scored[0].name };
}

/** Assign a lead to the least-loaded salesperson (idempotent). */
export async function autoAssignLead(orgId: string, leadId: string, actorId?: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId } });
  if (!lead || lead.assignedToId) return lead?.assignedToId ?? null;
  const pick = await pickLeastLoadedAssignee(orgId);
  if (!pick) return null;
  await prisma.lead.update({ where: { id: lead.id }, data: { assignedToId: pick.id } });
  await logAudit({
    organizationId: orgId, actorId,
    action: "LEAD_ASSIGNED", targetType: "Lead", targetId: lead.id,
    detail: `${lead.name} assigned to ${pick.name} (least-loaded)`,
  });
  return pick.id;
}

export async function setLeadStatus(orgId: string, leadId: string, status: LeadStatus, actorId?: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId } });
  if (!lead) throw new Error("Lead not found");
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status, lastContactAt: status === "CONTACTED" && !lead.lastContactAt ? new Date() : lead.lastContactAt },
  });
  await logAudit({
    organizationId: orgId, actorId,
    action: "LEAD_STATUS_CHANGED", targetType: "Lead", targetId: lead.id,
    detail: `${lead.name}: ${lead.status} → ${status}`,
  });
}

/** Move a deal between kanban stages; keeps closedAt / financeSentAt truthful. */
export async function setDealStage(orgId: string, dealId: string, stage: DealStage, actorId?: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId: orgId } });
  if (!deal) throw new Error("Deal not found");
  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      status: stage,
      closedAt: stage === "WON" || stage === "LOST" ? new Date() : null,
      financeSentAt: stage === "PENDING_FINANCE" && !deal.financeSentAt ? new Date() : deal.financeSentAt,
    },
  });
  await logAudit({
    organizationId: orgId, actorId,
    action: "DEAL_STAGE_CHANGED", targetType: "Deal", targetId: deal.id,
    detail: `${deal.status} → ${stage}`,
  });
}

type LogContactInput = {
  channel: "PHONE" | "EMAIL" | "SMS" | "IN_PERSON";
  direction?: "OUTBOUND" | "INBOUND";
  summary: string;
  /** When the lead has no customer yet, create/link one from these details. */
  customerName?: string;
  email?: string;
  phone?: string;
};

/** Log the first (or next) contact on a lead: links/creates the customer,
 *  records the communication, stamps lastContactAt and moves status forward. */
export async function logLeadContact(orgId: string, leadId: string, input: LogContactInput, actorId?: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId } });
  if (!lead) throw new Error("Lead not found");
  if (!input.summary.trim()) throw new Error("Write a short summary of the contact");

  let customerId = lead.customerId;
  if (!customerId) {
    const name = input.customerName?.trim() || lead.name;
    const existing = await prisma.customer.findFirst({ where: { organizationId: orgId, name } });
    customerId = existing?.id ?? (
      await prisma.customer.create({
        data: { organizationId: orgId, name, email: input.email?.trim() || null, phone: input.phone?.trim() || null },
      })
    ).id;
    await prisma.lead.update({ where: { id: lead.id }, data: { customerId } });
  }

  await prisma.communication.create({
    data: {
      organizationId: orgId,
      customerId,
      channel: input.channel,
      direction: input.direction ?? "OUTBOUND",
      summary: input.summary.trim().slice(0, 1000),
    },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastContactAt: new Date(), status: lead.status === "NEW" ? "CONTACTED" : lead.status },
  });
  await logAudit({
    organizationId: orgId, actorId,
    action: "LEAD_CONTACT_LOGGED", targetType: "Lead", targetId: lead.id,
    detail: `${input.channel} contact with ${lead.name}: ${input.summary.trim().slice(0, 80)}`,
  });
  return { customerId };
}

/** One-click contact logging on a customer 360 page. */
export async function logCustomerContact(orgId: string, customerId: string, input: LogContactInput, actorId?: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: orgId } });
  if (!customer) throw new Error("Customer not found");
  if (!input.summary.trim()) throw new Error("Write a short summary of the contact");
  await prisma.communication.create({
    data: {
      organizationId: orgId,
      customerId,
      channel: input.channel,
      direction: input.direction ?? "OUTBOUND",
      summary: input.summary.trim().slice(0, 1000),
    },
  });
  await logAudit({
    organizationId: orgId, actorId,
    action: "CONTACT_LOGGED", targetType: "Customer", targetId: customer.id,
    detail: `${input.channel} contact with ${customer.name}: ${input.summary.trim().slice(0, 80)}`,
  });
}
