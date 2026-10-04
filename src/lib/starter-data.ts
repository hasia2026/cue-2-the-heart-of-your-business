import { prisma } from "./prisma";
import { logAudit } from "./audit";

// ─────────────────────────────────────────────────────────────
// Starter data — a small, clearly-labeled sample of business
// activity for a brand-new workspace, so the intelligence engine
// has something real to analyze. Scoped 100% to the caller's org.
// ─────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const d = (n: number) => new Date(Date.now() + n * DAY);

export async function spawnStarterData(orgId: string, pack: "HOME" | "AUTO") {
  const customers: { name: string; email: string; phone: string; type: string; servicePlan?: string }[] =
    pack === "AUTO"
      ? [
          { name: "Jordan Whitfield", email: "jordan.w@example.com", phone: "(555) 201-3344", type: "RESIDENTIAL" },
          { name: "Amara Osei", email: "amara.osei@example.com", phone: "(555) 882-1109", type: "RESIDENTIAL" },
          { name: "Diego Fuentes", email: "diego.f@example.com", phone: "(555) 340-7781", type: "RESIDENTIAL" },
          { name: "Hannah Lieu", email: "hannah.lieu@example.com", phone: "(555) 415-9922", type: "RESIDENTIAL" },
          { name: "Robert Mendez", email: "r.mendez@example.com", phone: "(555) 776-5510", type: "COMMERCIAL", servicePlan: "Fleet service agreement" },
        ]
      : [
          { name: "Karen & Bill Hendricks", email: "k.hendricks@example.com", phone: "(555) 310-2288", type: "RESIDENTIAL", servicePlan: "Annual maintenance plan" },
          { name: "Ravi Patel", email: "ravi.patel@example.com", phone: "(555) 947-6612", type: "RESIDENTIAL", servicePlan: "Annual maintenance plan" },
          { name: "Linh Nguyen", email: "linh.nguyen@example.com", phone: "(555) 208-4477", type: "RESIDENTIAL" },
          { name: "Erin Walsh", email: "erin.walsh@example.com", phone: "(555) 663-9021", type: "RESIDENTIAL" },
          { name: "Kowalski Bakery", email: "office@kowalski.example.com", phone: "(555) 505-1187", type: "COMMERCIAL" },
        ];

  const created = [] as { id: string; name: string }[];
  for (const c of customers) {
    const row = await prisma.customer.create({
      data: { organizationId: orgId, name: c.name, email: c.email, phone: c.phone, type: c.type, servicePlan: c.servicePlan ?? null },
    });
    created.push({ id: row.id, name: row.name });
  }

  // Employees for assignment context
  const tech = await prisma.employee.create({
    data: { organizationId: orgId, name: "Team Member A", title: pack === "AUTO" ? "Salesperson" : "Technician", skills: "Customer service, Follow-up" },
  });

  if (pack === "AUTO") {
    const mkV = (stock: string, year: number, make: string, model: string, kind: string, status: string, list: number, cost: number, listed: number) =>
      prisma.vehicle.create({ data: { organizationId: orgId, stockNumber: stock, year, make, model, kind, status, listPrice: list, cost, listedAt: d(listed) } });

    const v1 = await mkV("S1001", 2023, "Toyota", "Camry", "USED", "AVAILABLE", 28900, 25600, -35); // aged
    const v2 = await mkV("S1002", 2024, "Honda", "CR-V", "NEW", "AVAILABLE", 35400, 33200, -4);
    await mkV("S1003", 2022, "Ford", "F-150", "USED", "AVAILABLE", 38700, 34800, -12);

    // Missed leads (the classic dealership leak)
    for (const [i, c] of [created[0], created[1], created[2]].entries()) {
      await prisma.lead.create({
        data: { organizationId: orgId, name: c.name, source: i === 2 ? "PHONE" : "WEB", interest: i === 2 ? "F-150 trade-in" : "SUV under $30k", estValue: 2800 + i * 400, status: "NEW", createdAt: d(-(1 + i)) },
      });
    }
    // Stalled deals
    await prisma.deal.create({ data: { organizationId: orgId, customerId: created[3].id, vehicleId: v1.id, dealType: "USED", status: "NEGOTIATING", amount: 28900, createdAt: d(-5) } });
    await prisma.deal.create({ data: { organizationId: orgId, customerId: created[4].id, vehicleId: v2.id, dealType: "NEW", status: "NEGOTIATING", amount: 35400, createdAt: d(-4) } });
    // Unbilled service
    await prisma.serviceOrder.create({ data: { organizationId: orgId, customerId: created[0].id, vehicleId: v1.id, title: "Brake service", amount: 640, status: "COMPLETED", openedAt: d(-6), completedAt: d(-6) } });
    await prisma.serviceOrder.create({ data: { organizationId: orgId, customerId: created[1].id, title: "Oil change + inspection", amount: 129, status: "COMPLETED", openedAt: d(-3), completedAt: d(-3) } });
  } else {
    // 3 completed jobs with no invoice (revenue leakage)
    for (const [i, c] of [created[0], created[2], created[4]].entries()) {
      await prisma.job.create({
        data: { organizationId: orgId, customerId: c.id, employeeId: tech.id, title: ["AC compressor replacement", "Water heater replacement", "Panel upgrade"][i], trade: ["HVAC", "PLUMBING", "ELECTRICAL"][i], status: "COMPLETED", scheduledFor: d(-(10 + i * 3)), completedAt: d(-(10 + i * 3)), amount: [1850, 1450, 980][i] },
      });
    }
    // Stale estimates
    for (const [i, c] of [created[1], created[3], created[4]].entries()) {
      await prisma.estimate.create({
        data: { organizationId: orgId, customerId: c.id, title: ["Ductless mini-split", "Bathroom repipe", "Backup generator"][i], amount: [4200, 3600, 5800][i], status: "SENT", sentAt: d(-(18 + i * 4)) },
      });
    }
    // A healthy billed job
    const billed = await prisma.job.create({
      data: { organizationId: orgId, customerId: created[3].id, employeeId: tech.id, title: "Seasonal tune-up", trade: "HVAC", status: "COMPLETED", scheduledFor: d(-30), completedAt: d(-30), amount: 189 },
    });
    await prisma.invoice.create({ data: { organizationId: orgId, customerId: created[3].id, jobId: billed.id, number: "INV-9001", amount: 189, status: "PAID", issuedAt: d(-29), dueAt: d(-8), paidAt: d(-24) } });
    await prisma.payment.create({ data: { organizationId: orgId, customerId: created[3].id, amount: 189, method: "CARD", receivedAt: d(-24) } });
  }

  // Communication history so customer 360 timelines aren't empty on day one
  const touches =
    pack === "AUTO"
      ? [
          { customerId: created[0].id, channel: "PHONE", direction: "OUTBOUND", summary: "Called about the SUV inquiry — went to voicemail, will try again tomorrow.", occurredAt: d(-1) },
          { customerId: created[3].id, channel: "EMAIL", direction: "OUTBOUND", summary: "Sent the F-150 trade appraisal and two lease options.", occurredAt: d(-4) },
          { customerId: created[4].id, channel: "IN_PERSON", direction: "INBOUND", summary: "Fleet manager stopped by to talk service scheduling for 4 vans.", occurredAt: d(-3) },
        ]
      : [
          { customerId: created[0].id, channel: "PHONE", direction: "OUTBOUND", summary: "Annual maintenance reminder — booked for next Tuesday 9am.", occurredAt: d(-5) },
          { customerId: created[3].id, channel: "EMAIL", direction: "OUTBOUND", summary: "Generator quote follow-up with the checklist attached.", occurredAt: d(-17) },
        ];
  for (const t of touches) {
    await prisma.communication.create({
      data: { organizationId: orgId, customerId: t.customerId, channel: t.channel, direction: t.direction, summary: t.summary, occurredAt: t.occurredAt },
    });
  }

  await logAudit({
    organizationId: orgId,
    actorType: "SYSTEM",
    action: "STARTER_DATA_GENERATED",
    detail: `Sample ${pack === "AUTO" ? "dealership" : "home services"} activity created for analysis`,
  });

  return true;
}
