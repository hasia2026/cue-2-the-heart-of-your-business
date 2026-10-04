/**
 * Verifies CRM core end-to-end against a scratch org:
 * response aging, least-loaded assignment, contact logging (with
 * customer linking), deal stage transitions, and the signal →
 * lead → assign flow.
 * npx tsx scripts/test-crm.ts
 */
import { prisma } from "../src/lib/prisma";
import { responseState, autoAssignLead, setLeadStatus, logLeadContact, logCustomerContact, setDealStage, pickLeastLoadedAssignee } from "../src/lib/crm";
import { ingestSignals, convertSignalToLead } from "../src/lib/signals";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  // ── 1. Response aging ──
  assert(responseState(new Date(Date.now() - 5 * 60_000), null) === "due", "5-minute-old lead is 'due'");
  assert(responseState(new Date(Date.now() - 60 * 60_000), null) === "late", "1-hour-old lead is 'late'");
  assert(responseState(new Date(Date.now() - 9 * 86_400_000), new Date()) === "handled", "contacted lead is 'handled'");

  const org = await prisma.organization.create({ data: { name: "__test-crm", isDemo: true } });
  const sales = await prisma.department.create({ data: { organizationId: org.id, name: "Sales" } });
  const alice = await prisma.employee.create({ data: { organizationId: org.id, name: "Alice", title: "Salesperson", departmentId: sales.id } });
  const bob = await prisma.employee.create({ data: { organizationId: org.id, name: "Bob", title: "Salesperson", departmentId: sales.id } });
  const tech = await prisma.employee.create({ data: { organizationId: org.id, name: "Tech", title: "Technician", departmentId: sales.id } });

  // ── 2. Least-loaded assignment ──
  const pick1 = await pickLeastLoadedAssignee(org.id);
  assert(pick1?.name === "Alice", `picks first alphabetical among tied sales staff (got ${pick1?.name}); technician excluded`);

  const lead1 = await prisma.lead.create({ data: { organizationId: org.id, name: "Early lead", status: "NEW" } });
  await prisma.lead.update({ where: { id: lead1.id }, data: { assignedToId: alice.id } });
  const pick2 = await pickLeastLoadedAssignee(org.id);
  assert(pick2?.name === "Bob", "next pick goes to the other salesperson");

  // ── 3. Signal → lead → auto-assign flow (the deep-link pipeline) ──
  const ing = await ingestSignals(org.id, [{ externalId: "crm-e2e-1", author: "Flow Tester", content: "Looking to buy a truck in the Riverside area." }]);
  assert(ing.created === 1, "signal ingested");
  const sig = await prisma.marketSignal.findFirst({ where: { organizationId: org.id } });
  const conv = await convertSignalToLead(org.id, sig!.id);
  assert(!!conv.leadId && !conv.already, "signal converted to lead");
  const flowLead = await prisma.lead.findUnique({ where: { id: conv.leadId } });
  assert(flowLead?.assignedToId != null, "converted lead auto-assigned (15-minute clock starts fairly)");
  const conv2 = await convertSignalToLead(org.id, sig!.id);
  assert(conv2.already, "re-conversion is idempotent");

  // ── 4. Contact logging creates + links the customer ──
  const logged = await logLeadContact(org.id, flowLead!.id, {
    channel: "PHONE",
    summary: "Called — wants a test drive Saturday morning.",
    email: "flow@test.dev",
    phone: "(951) 555-0100",
  });
  const cust = await prisma.customer.findUnique({ where: { id: logged.customerId } });
  assert(cust?.name === "Flow Tester" && cust?.email === "flow@test.dev", "customer created from lead on first log");
  const after = await prisma.lead.findUnique({ where: { id: flowLead!.id } });
  assert(after?.customerId === cust?.id, "lead linked to customer");
  assert(after?.status === "CONTACTED" && after?.lastContactAt != null, "lead moved to CONTACTED with lastContactAt stamped");
  const comm = await prisma.communication.findFirst({ where: { organizationId: org.id, customerId: cust!.id } });
  assert(comm?.channel === "PHONE" && comm.summary.includes("test drive"), "communication recorded on the customer");
  assert(responseState(after!.createdAt, after!.lastContactAt) === "handled", "lead no longer flagged for response");

  // Second log must not duplicate the customer
  await logLeadContact(org.id, flowLead!.id, { channel: "SMS", summary: "Texted Saturday confirmation." });
  const commCount = await prisma.communication.count({ where: { organizationId: org.id, customerId: cust!.id } });
  assert(commCount === 2, "second log appends to same customer");
  const custCount = await prisma.customer.count({ where: { organizationId: org.id, name: "Flow Tester" } });
  assert(custCount === 1, "no duplicate customer created");

  // ── 5. Statuses & deal stages ──
  await setLeadStatus(org.id, flowLead!.id, "QUALIFIED");
  const q = await prisma.lead.findUnique({ where: { id: flowLead!.id } });
  assert(q?.status === "QUALIFIED", "lead status set");

  const deal = await prisma.deal.create({ data: { organizationId: org.id, customerId: cust!.id, amount: 30000, status: "NEGOTIATING" } });
  await setDealStage(org.id, deal.id, "PENDING_FINANCE");
  const pf = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert(pf?.status === "PENDING_FINANCE" && pf.financeSentAt != null, "deal → PENDING_FINANCE stamps financeSentAt");
  await setDealStage(org.id, deal.id, "WON");
  const won = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert(won?.status === "WON" && won.closedAt != null, "deal → WON stamps closedAt");
  await setDealStage(org.id, deal.id, "NEGOTIATING");
  const back = await prisma.deal.findUnique({ where: { id: deal.id } });
  assert(back?.status === "NEGOTIATING" && back.closedAt === null, "reopen clears closedAt");

  // ── 6. Customer contact logging ──
  await logCustomerContact(org.id, cust!.id, { channel: "EMAIL", summary: "Sent finance paperwork for signature." });
  const commCount2 = await prisma.communication.count({ where: { organizationId: org.id, customerId: cust!.id } });
  assert(commCount2 === 3, "customer 360 logging appends");

  // Audit trail
  const audits = await prisma.auditEvent.count({
    where: { organizationId: org.id, action: { in: ["LEAD_ASSIGNED", "SIGNAL_CONVERTED_TO_LEAD", "LEAD_CONTACT_LOGGED", "CONTACT_LOGGED", "LEAD_STATUS_CHANGED", "DEAL_STAGE_CHANGED"] } },
  });
  assert(audits >= 7, `audit trail complete (${audits} events)`);

  // Cleanup
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id } });
  await prisma.marketWatch.deleteMany({ where: { organizationId: org.id } });
  await prisma.communication.deleteMany({ where: { organizationId: org.id } });
  await prisma.deal.deleteMany({ where: { organizationId: org.id } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.task.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.employee.deleteMany({ where: { organizationId: org.id } });
  await prisma.department.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("PASS — CRM core verified, scratch org removed");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
