import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const DAY = 86_400_000;
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY);
}

async function main() {
  console.log("Seeding CUE demo workspace — Summit Home Services…");

  // Wipe in dependency order (idempotent reseed)
  await prisma.auditEvent.deleteMany({});
  await prisma.deal.deleteMany({});
  await prisma.serviceOrder.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.trainingAssignment.deleteMany({});
  await prisma.trainingModule.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.workflow.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.recommendation.deleteMany({});
  await prisma.insight.deleteMany({});
  await prisma.fact.deleteMany({});
  await prisma.entity.deleteMany({});
  await prisma.knowledgeItem.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.estimate.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.communication.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.brandAsset.deleteMany({});
  await prisma.idea.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.aiSettings.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.businessProfile.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // ── Identity & organization ──
  const user = await prisma.user.create({
    data: {
      email: "owner@summithome.demo",
      name: "Dana Whitfield",
      passwordHash: hashPassword("demo1234"),
    },
  });

  const org = await prisma.organization.create({
    data: { name: "Summit Home Services", isDemo: true },
  });

  await prisma.member.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  // ── Business profile & goals ──
  const profile = await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      name: "Summit Home Services",
      industry: "HVAC / Plumbing / Electrical home services",
      size: "11-50",
      locations: "Cedar Falls, IA — serving the greater metro area",
      businessModel:
        "Residential service, repair and replacement across HVAC, plumbing and electrical, plus recurring maintenance plans",
      offerings: [
        "HVAC repair & installation",
        "Plumbing repair & repiping",
        "Electrical panel & fixture work",
        "Annual Comfort Club maintenance plan",
        "Water heater replacement",
        "Generator installation (new)",
      ].join("\n"),
      targetCustomers:
        "Homeowners aged 35–70 in single-family homes; small landlords with 2–10 units",
      mission:
        "Keep every home we serve safe, comfortable and problem-free — with honest advice and no surprise bills.",
      values: [
        "Do it right the first time",
        "Communicate before the customer has to ask",
        "Every technician goes home safe",
        "Leave every home better than we found it",
      ].join("\n"),
      operationalPriorities: [
        "Same-day response on no-heat / no-cool calls",
        "Invoice within 24 hours of job completion",
        "Follow up every estimate within 7 days",
        "Keep Comfort Club renewal rate above 90%",
      ].join("\n"),
      onboardingStep: 10,
    },
  });

  await prisma.goal.createMany({
    data: [
      { profileId: profile.id, title: "Reach $2.4M annual revenue", horizon: "YEAR" },
      { profileId: profile.id, title: "Grow Comfort Club to 400 members", horizon: "YEAR" },
      { profileId: profile.id, title: "Eliminate unbilled-job backlog", horizon: "QUARTER" },
      { profileId: profile.id, title: "Launch generator installation offering", horizon: "QUARTER" },
    ],
  });

  // ── Departments & employees ──
  const deptHvac = await prisma.department.create({ data: { organizationId: org.id, name: "HVAC", description: "Heating, cooling and indoor air quality" } });
  const deptPlumbing = await prisma.department.create({ data: { organizationId: org.id, name: "Plumbing", description: "Repair, repiping and water heaters" } });
  const deptElectrical = await prisma.department.create({ data: { organizationId: org.id, name: "Electrical", description: "Panels, fixtures and generators" } });
  const deptOffice = await prisma.department.create({ data: { organizationId: org.id, name: "Office & Dispatch", description: "Scheduling, billing and customer care" } });
  const deptLeadership = await prisma.department.create({ data: { organizationId: org.id, name: "Leadership", description: "Ownership and operations management" } });

  const dana = await prisma.employee.create({ data: { organizationId: org.id, name: "Dana Whitfield", title: "Owner", departmentId: deptLeadership.id, email: "owner@summithome.demo", skills: "Business strategy, Pricing, Customer relationships", responsibilities: "Company direction, major decisions, vendor relationships", hireDate: new Date("2016-03-01") } });
  const marcus = await prisma.employee.create({ data: { organizationId: org.id, name: "Marcus Lee", title: "Operations Manager", departmentId: deptLeadership.id, managerId: dana.id, skills: "Dispatch, Scheduling, Process design", responsibilities: "Daily dispatch, technician scheduling, process compliance", hireDate: new Date("2019-06-15") } });
  const priya = await prisma.employee.create({ data: { organizationId: org.id, name: "Priya Natarajan", title: "Office Manager", departmentId: deptOffice.id, managerId: marcus.id, skills: "Billing, Invoicing, Customer service, QuickBooks", responsibilities: "Invoicing, payment processing, customer follow-up", hireDate: new Date("2020-01-10") } });
  const jake = await prisma.employee.create({ data: { organizationId: org.id, name: "Jake Morrison", title: "Senior HVAC Technician", departmentId: deptHvac.id, managerId: marcus.id, skills: "Furnace repair, AC installation, Diagnostics, EPA 608", responsibilities: "Complex HVAC repairs, new installs, mentoring apprentices", hireDate: new Date("2018-04-02") } });
  const sofia = await prisma.employee.create({ data: { organizationId: org.id, name: "Sofia Reyes", title: "HVAC Technician", departmentId: deptHvac.id, managerId: jake.id, skills: "AC maintenance, Furnace diagnostics", responsibilities: "Maintenance visits and standard repairs", hireDate: new Date("2021-08-16") } });
  const tom = await prisma.employee.create({ data: { organizationId: org.id, name: "Tom Becker", title: "Plumber", departmentId: deptPlumbing.id, managerId: marcus.id, skills: "Repiping, Water heaters, Leak detection", responsibilities: "Plumbing repairs and water heater replacements", hireDate: new Date("2019-11-04") } });
  const alicia = await prisma.employee.create({ data: { organizationId: org.id, name: "Alicia Grant", title: "Electrician", departmentId: deptElectrical.id, managerId: marcus.id, skills: "Panel upgrades, Generators, Code compliance", responsibilities: "Electrical service, panel work, generator installs", hireDate: new Date("2022-02-21") } });
  const dev = await prisma.employee.create({ data: { organizationId: org.id, name: "Dev Okafor", title: "Apprentice Technician", departmentId: deptHvac.id, managerId: jake.id, skills: "Assists installs", responsibilities: "Support senior technicians, tools and site prep", hireDate: daysFromNow(-120) } });

  // ── Customers ──
  const mkCustomer = (data: {
    name: string; email: string; phone: string; address: string;
    type?: string; servicePlan?: string; notes?: string;
  }) => prisma.customer.create({ data: { organizationId: org.id, type: "RESIDENTIAL", status: "ACTIVE", ...data } });

  const cHendricks = await mkCustomer({ name: "Karen & Bill Hendricks", email: "k.hendricks@example.com", phone: "(319) 555-0141", address: "1428 Ridge Ct, Cedar Falls", servicePlan: "Annual Comfort Club", notes: "Loyal since 2017. Two systems on property." });
  const cPatel = await mkCustomer({ name: "Ravi Patel", email: "ravi.patel@example.com", phone: "(319) 555-0193", address: "77 Prairie Dr, Cedar Falls", servicePlan: "Annual Comfort Club" });
  const cNguyen = await mkCustomer({ name: "Linh Nguyen", email: "linh.nguyen@example.com", phone: "(319) 555-0117", address: "3105 Cedar Heights Dr" });
  const cOsborne = await mkCustomer({ name: "Osborne Rentals LLC", email: "mike@osbornerentals.example.com", phone: "(319) 555-0129", address: "6-unit building, 210 Main St", type: "COMMERCIAL", servicePlan: "Annual Comfort Club", notes: "Small landlord, decides quickly, prefers email." });
  const cWalsh = await mkCustomer({ name: "Erin Walsh", email: "erin.walsh@example.com", phone: "(319) 555-0166", address: "9405 Orchard Hill Ln" });
  const cDelgado = await mkCustomer({ name: "Miguel Delgado", email: "m.delgado@example.com", phone: "(319) 555-0152", address: "512 Union Rd" });
  const cFoster = await mkCustomer({ name: "Jeanette Foster", email: "jfoster@example.com", phone: "(319) 555-0187", address: "2387 Greenhill Rd", servicePlan: "Annual Comfort Club" });
  const cBrooks = await mkCustomer({ name: "Stanley Brooks", email: "s.brooks@example.com", phone: "(319) 555-0175", address: "14 Timber Ln" });
  const cIyer = await mkCustomer({ name: "Deepa Iyer", email: "deepa.iyer@example.com", phone: "(319) 555-0138", address: "6200 Sioux Dr" });
  const cKowalski = await mkCustomer({ name: "Kowalski & Sons Bakery", email: "office@kowalskibakery.example.com", phone: "(319) 555-0199", address: "115 Main St", type: "COMMERCIAL", notes: "Walk-in cooler is business-critical." });
  const cThompson = await mkCustomer({ name: "Gary Thompson", email: "gthompson@example.com", phone: "(319) 555-0149", address: "4311 Rainbow Dr", servicePlan: "Annual Comfort Club" });
  const cRivera = await mkCustomer({ name: "Carmen Rivera", email: "carmen.rivera@example.com", phone: "(319) 555-0121", address: "8807 Ansborough Ave" });

  // ── Jobs ──
  // 7 COMPLETED with NO invoice — engineered total $12,480
  const unbilledJobs: [any, string, string, number, number, any, string][] = [
    [cHendricks, "AC compressor replacement", "HVAC", 2400, -38, jake, "Compressor failed; replaced with 10-year warranty unit. Customer confirmed satisfaction on site."],
    [cOsborne, "Water heater replacement — unit 4", "PLUMBING", 1450, -33, tom, "40-gal gas water heater swapped. Landlord approved by email."],
    [cNguyen, "Furnace blower motor repair", "HVAC", 980, -27, sofia, "Blower motor replaced, system tested through full cycle."],
    [cKowalski, "Walk-in cooler compressor service", "HVAC", 2680, -22, jake, "Emergency call. Cooler back to temperature same day. Business-critical."],
    [cBrooks, "Main line clear + pressure test", "PLUMBING", 720, -18, tom, "Cleared main line blockage; camera verified flow."],
    [cIyer, "Panel upgrade to 200A", "ELECTRICAL", 1850, -12, alicia, "Permitted panel upgrade, inspection passed."],
    [cDelgado, "Furnace ignition module replacement", "HVAC", 2400, -9, sofia, "Ignition module and flame sensor replaced. Heat verified."],
  ];
  for (const [customer, title, trade, amount, completedDaysAgo, employee, notes] of unbilledJobs) {
    await prisma.job.create({
      data: { organizationId: org.id, customerId: customer.id, employeeId: employee.id, title, trade, status: "COMPLETED", scheduledFor: daysFromNow(completedDaysAgo), completedAt: daysFromNow(completedDaysAgo), amount, notes },
    });
  }

  // COMPLETED jobs WITH invoices (healthy baseline)
  const billedJobs: [any, string, string, number, number, any, string][] = [
    [cPatel, "AC seasonal maintenance", "HVAC", 189, -55, sofia, "Comfort Club spring tune-up."],
    [cWalsh, "Kitchen faucet replacement", "PLUMBING", 465, -48, tom, "Customer-supplied faucet installed."],
    [cThompson, "Furnace repair — ignitor", "HVAC", 340, -41, jake, "Hot surface ignitor replaced."],
    [cFoster, "Ceiling fan install", "ELECTRICAL", 385, -35, alicia, "Two fans installed, balanced."],
    [cRivera, "Sump pump replacement", "PLUMBING", 1120, -25, tom, "Primary + battery backup installed."],
  ];
  const createdBilledJobs = [];
  for (const [customer, title, trade, amount, completedDaysAgo, employee, notes] of billedJobs) {
    createdBilledJobs.push(
      await prisma.job.create({
        data: { organizationId: org.id, customerId: customer.id, employeeId: employee.id, title, trade, status: "COMPLETED", scheduledFor: daysFromNow(completedDaysAgo), completedAt: daysFromNow(completedDaysAgo), amount, notes },
      })
    );
  }

  // Long-ago plan customers whose annual visit slipped (drives the retention signal)
  const cVance = await mkCustomer({ name: "Robert & Anne Vance", email: "vance.home@example.com", phone: "(319) 555-0113", address: "7402 University Ave", servicePlan: "Annual Comfort Club", notes: "Usually books spring and fall visits." });
  const cMarsh = await mkCustomer({ name: "Diane Marsh", email: "diane.marsh@example.com", phone: "(319) 555-0182", address: "225 W 5th St", servicePlan: "Annual Comfort Club" });
  const vanceJob = await prisma.job.create({ data: { organizationId: org.id, customerId: cVance.id, employeeId: jake.id, title: "AC tune-up — annual visit", trade: "HVAC", status: "COMPLETED", scheduledFor: daysFromNow(-355), completedAt: daysFromNow(-355), amount: 189, notes: "Spring visit. Fall visit never booked." } });
  const marshJob = await prisma.job.create({ data: { organizationId: org.id, customerId: cMarsh.id, employeeId: sofia.id, title: "Furnace tune-up — annual visit", trade: "HVAC", status: "COMPLETED", scheduledFor: daysFromNow(-342), completedAt: daysFromNow(-342), amount: 189 } });
  // These routine visits were billed normally — only the anomaly jobs stay unbilled
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cVance.id, jobId: vanceJob.id, number: "INV-1039", amount: 189, status: "PAID", issuedAt: daysFromNow(-354), dueAt: daysFromNow(-333), paidAt: daysFromNow(-348) } });
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cMarsh.id, jobId: marshJob.id, number: "INV-1040", amount: 189, status: "PAID", issuedAt: daysFromNow(-341), dueAt: daysFromNow(-320), paidAt: daysFromNow(-335) } });

  // Scheduled jobs in flight
  await prisma.job.create({ data: { organizationId: org.id, customerId: cWalsh.id, employeeId: jake.id, title: "AC replacement — 3.5 ton", trade: "HVAC", status: "SCHEDULED", scheduledFor: daysFromNow(3), amount: 6800, notes: "Deposit taken. Equipment ordered." } });
  await prisma.job.create({ data: { organizationId: org.id, customerId: cPatel.id, employeeId: alicia.id, title: "EV charger install", trade: "ELECTRICAL", status: "SCHEDULED", scheduledFor: daysFromNow(5), amount: 1250 } });
  await prisma.job.create({ data: { organizationId: org.id, customerId: cFoster.id, employeeId: sofia.id, title: "Fall furnace tune-up", trade: "HVAC", status: "SCHEDULED", scheduledFor: daysFromNow(8), amount: 189 } });

  // ── Estimates ──
  // 14 SENT/VIEWED estimates, all past the 14-day follow-up window — total $38,700
  const staleEstimates: [any, string, number, number, string][] = [
    [cOsborne, "Repipe unit 2 — polybutylene", 4800, -43, "VIEWED"],
    [cIyer, "Whole-home generator 22kW", 5000, -41, "VIEWED"],
    [cNguyen, "AC replacement — 2.5 ton", 4300, -39, "SENT"],
    [cHendricks, "Ductless mini-split for sunroom", 3800, -37, "SENT"],
    [cWalsh, "Bathroom repipe", 3000, -35, "SENT"],
    [cBrooks, "Tankless water heater", 2800, -33, "SENT"],
    [cKowalski, "Backup cooler for bakery", 2600, -31, "SENT"],
    [cDelgado, "Water softener + RO system", 2400, -29, "SENT"],
    [cFoster, "Attic insulation + air sealing", 2200, -27, "VIEWED"],
    [cThompson, "Smart thermostat + zoning", 2000, -25, "SENT"],
    [cPatel, "EV charger panel prep", 1800, -23, "SENT"],
    [cRivera, "Ejector pump replacement", 1400, -21, "SENT"],
    [cOsborne, "Smoke/CO detectors — all units", 1400, -17, "SENT"],
    [cPatel, "Surge protection whole-home", 1200, -15, "SENT"],
  ];
  for (const [customer, title, amount, sentDaysAgo, status] of staleEstimates) {
    await prisma.estimate.create({
      data: { organizationId: org.id, customerId: customer.id, title, amount, status, sentAt: daysFromNow(sentDaysAgo), expiresAt: daysFromNow(sentDaysAgo + 30) },
    });
  }

  // Healthy estimates: one accepted, one declined, one recent (no flag)
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cPatel.id, title: "Humidifier install", amount: 850, status: "ACCEPTED", sentAt: daysFromNow(-20), lastFollowUpAt: daysFromNow(-10) } });
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cBrooks.id, title: "Garbage disposal replacement", amount: 620, status: "DECLINED", sentAt: daysFromNow(-30), lastFollowUpAt: daysFromNow(-22) } });
  await prisma.estimate.create({ data: { organizationId: org.id, customerId: cNguyen.id, title: "Refrigerator water line", amount: 380, status: "SENT", sentAt: daysFromNow(-2) } });

  // ── Invoices ──
  let invNum = 1041;
  for (const j of createdBilledJobs) {
    const paid = invNum % 2 === 1;
    await prisma.invoice.create({
      data: {
        organizationId: org.id, customerId: j.customerId, jobId: j.id,
        number: `INV-${invNum}`, amount: j.amount,
        status: paid ? "PAID" : "PAID",
        issuedAt: daysFromNow(((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY),
        dueAt: daysFromNow((((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY) + 21),
        paidAt: daysFromNow((((j.completedAt ?? new Date()).getTime() - Date.now()) / DAY) + (paid ? 6 : 18)),
      },
    });
    invNum++;
  }

  // Overdue invoices (3, total $2,180) — due dates in the past
  const overdueInvoices: [any, string, number, number][] = [
    [cOsborne, "INV-1052", 1250, 34],
    [cThompson, "INV-1057", 465, 26],
    [cKowalski, "INV-1059", 465, 19],
  ];
  for (const [customer, number, amount, dueDaysAgo] of overdueInvoices) {
    await prisma.invoice.create({
      data: { organizationId: org.id, customerId: customer.id, number, amount, status: "OVERDUE", issuedAt: daysFromNow(-dueDaysAgo - 21), dueAt: daysFromNow(-dueDaysAgo) },
    });
  }

  // Recent invoices not yet due (2)
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cWalsh.id, number: "INV-1063", amount: 465, status: "SENT", issuedAt: daysFromNow(-10), dueAt: daysFromNow(11) } });
  await prisma.invoice.create({ data: { organizationId: org.id, customerId: cRivera.id, number: "INV-1064", amount: 1120, status: "SENT", issuedAt: daysFromNow(-6), dueAt: daysFromNow(15) } });

  // ── Payments (against paid invoices) ──
  const paidInvoiceRows = await prisma.invoice.findMany({ where: { organizationId: org.id, status: "PAID" } });
  for (const inv of paidInvoiceRows) {
    await prisma.payment.create({
      data: { organizationId: org.id, customerId: inv.customerId, invoiceId: inv.id, amount: inv.amount, method: invNum % 2 ? "CARD" : "ACH", receivedAt: inv.paidAt ?? new Date() },
    });
  }

  // ── Communications ──
  const comms: [any, string, string, string, number][] = [
    [cHendricks, "PHONE", "INBOUND", "Asked about ductless options for the sunroom; estimate sent.", -21],
    [cOsborne, "EMAIL", "OUTBOUND", "Sent repipe estimate for unit 2; landlord reviewing.", -19],
    [cKowalski, "PHONE", "INBOUND", "Emergency cooler call — resolved same day. Very appreciative.", -22],
    [cIyer, "EMAIL", "INBOUND", "Asked about generator lead times; replied with 3-week estimate.", -17],
    [cPatel, "SMS", "OUTBOUND", "Reminder: fall tune-up scheduling.", -12],
    [cFoster, "PHONE", "INBOUND", "Asked to move fall tune-up to a morning slot.", -10],
    [cWalsh, "EMAIL", "OUTBOUND", "AC replacement deposit receipt and scheduling options.", -9],
    [cThompson, "EMAIL", "OUTBOUND", "Payment reminder for INV-1057.", -5],
    [cRivera, "SMS", "INBOUND", "Confirmed sump pump install date.", -8],
    [cNguyen, "PHONE", "OUTBOUND", "Post-repair check-in; reported all good.", -20],
  ];
  for (const [customer, channel, direction, summary, daysAgo] of comms) {
    await prisma.communication.create({
      data: { organizationId: org.id, customerId: customer.id, channel, direction, summary, occurredAt: daysFromNow(daysAgo) },
    });
  }

  // ── Documents & knowledge ──
  const docs: { title: string; fileName: string; kind: string; departmentId?: string; text: string; knowledge: { title: string; content: string; category: string; tags: string; status?: string }[] }[] = [
    {
      title: "Employee Handbook", fileName: "Employee Handbook.pdf", kind: "POLICY", departmentId: deptLeadership.id,
      text: "Summit Home Services Employee Handbook. Covers working hours, paid time off, safety requirements, uniform policy, vehicle use, cell phone use while driving, drug and alcohol policy, grievance procedure, and benefits. Technicians must log all jobs in CUE before leaving a site. PTO requests require 2 weeks notice and manager approval. Safety: gloves and eye protection required for all plumbing and electrical work; two-person lift above 60 lbs.",
      knowledge: [
        { title: "PTO & time-off policy", content: "Employees earn 1 day of PTO per month worked, accrued from hire date. Requests must be submitted at least 2 weeks in advance and approved by the Operations Manager (Marcus Lee). Unplanned absences should be reported to dispatch by 7:00 AM.", category: "POLICY", tags: "pto,leave,employees,handbook" },
        { title: "Job logging requirement", content: "Every technician must complete job logging — notes, parts used, and time — before leaving a customer site. This is what allows the office to invoice within 24 hours. Jobs not logged same-day are flagged to the Operations Manager.", category: "PROCEDURE", tags: "jobs,logging,technicians,invoicing" },
      ],
    },
    {
      title: "Refund & Warranty Policy", fileName: "Refund and Warranty Policy.pdf", kind: "POLICY", departmentId: deptOffice.id,
      text: "Refund policy: Customer may request a full refund within 30 days of service if the repair did not resolve the reported issue. Parts carry manufacturer warranty (1-10 years); labor carries a 1-year workmanship warranty. Refunds require Office Manager approval and are processed to the original payment method within 7 business days. Warranty work is scheduled at no charge; diagnostic fee is waived for warranty callbacks.",
      knowledge: [
        { title: "Refund policy", content: "Full refund within 30 days if a repair did not fix the reported problem. Requests go to the Office Manager (Priya Natarajan) for approval and are returned to the original payment method within 7 business days. No refunds on completed maintenance plan visits.", category: "POLICY", tags: "refund,returns,policy,billing" },
        { title: "Warranty coverage", content: "Labor carries a 1-year workmanship warranty. Parts carry the manufacturer's warranty (1–10 years depending on component). Warranty callbacks are scheduled free of charge and the diagnostic fee is waived. Warranty claims are logged against the original job record.", category: "POLICY", tags: "warranty,repairs,callbacks,policy" },
      ],
    },
    {
      title: "New Customer Onboarding Procedure", fileName: "Customer Onboarding Procedure.docx", kind: "PROCEDURE", departmentId: deptOffice.id,
      text: "Onboarding procedure for new customers: 1) Create customer record with address, phone, email and equipment list. 2) Send welcome email introducing the technician-arrival process and payment options. 3) Offer the Annual Comfort Club plan. 4) After first job, office calls within 3 days to confirm satisfaction. 5) Log any special access instructions (gate codes, dogs, parking). Owner: Office Manager. Target: complete within 2 business days of first contact.",
      knowledge: [
        { title: "How we onboard a new customer", content: "1) Create the customer record with full contact info and equipment list. 2) Send the welcome email. 3) Offer the Annual Comfort Club plan. 4) Call within 3 days after the first job to confirm satisfaction. 5) Record access instructions (gate codes, dogs, parking). The Office Manager owns onboarding; target is completion within 2 business days of first contact.", category: "PROCEDURE", tags: "onboarding,customers,procedure,how do we" },
      ],
    },
    {
      title: "After-Hours Fee Decision (Sept)", fileName: "After-Hours Fee Decision.pdf", kind: "RECORD", departmentId: deptLeadership.id,
      text: "Decision record: Effective October 1, after-hours emergency calls (before 8am, after 6pm, Sundays) carry a $129 diagnostic fee, credited toward the repair if approved. Rationale: last quarter's after-hours calls averaged 11/week with a 9% acceptance-to-repair conversion; the fee covers technician premium pay. Approved by Dana Whitfield. Customer-facing script updated in dispatch guide.",
      knowledge: [
        { title: "After-hours emergency fee — company decision", content: "As of October 1, after-hours emergency calls carry a $129 diagnostic fee, credited toward the repair if the customer approves the work. This was decided by Dana Whitfield in September after a quarter of data showed premium-pay costs outpacing revenue on after-hours runs. Dispatch script has been updated.", category: "DECISION", tags: "decision,pricing,after-hours,emergency" },
      ],
    },
    {
      title: "Comfort Club Service Standards", fileName: "Comfort Club Standards.pdf", kind: "PROCEDURE", departmentId: deptHvac.id,
      text: "Annual Comfort Club members receive: two system tune-ups per year (spring AC, fall furnace), priority scheduling, 15% off repairs, no diagnostic fee. Target renewal rate is 90%+. Members whose annual visit slips past 10 months must be called by the office to re-book. Renewal billing occurs on the anniversary month.",
      knowledge: [
        { title: "Comfort Club renewal rules", content: "Comfort Club members get two tune-ups yearly, priority scheduling, 15% off repairs and no diagnostic fee. If a member's annual visit slips past 10 months, the office must call to re-book. Target renewal rate: 90%+. Who is responsible: Office Manager (Priya Natarajan) tracks the renewal list monthly.", category: "PROCEDURE", tags: "comfort club,service plans,renewal,responsibility" },
      ],
    },
  ];
  for (const d of docs) {
    const doc = await prisma.document.create({
      data: {
        organizationId: org.id, title: d.title, fileName: d.fileName,
        mimeType: d.fileName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 120_000 + d.text.length * 13, kind: d.kind, departmentId: d.departmentId,
        status: "PROCESSED", extractedText: d.text, source: "SEED", uploadedAt: daysFromNow(-60),
      },
    });
    for (const k of d.knowledge) {
      await prisma.knowledgeItem.create({
        data: { organizationId: org.id, documentId: doc.id, title: k.title, content: k.content, category: k.category, tags: k.tags, status: k.status ?? "FACT" },
      });
    }
  }

  // Extra knowledge not tied to a document
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Lesson learned: cooler emergency at Kowalski's",
      content: "The September walk-in cooler failure at Kowalski & Sons showed we had no documented emergency vendor for refrigerant recovery. The job was completed same-day, but procurement of the compressor took 6 hours. Lesson: keep a stocked compressor for the bakery's cooler model, and confirm commercial emergency SLAs quarterly.",
      category: "LESSON", tags: "lesson,emergency,commercial,cooler", status: "FACT",
    },
  });

  // ── Entities & facts ──
  const eCustomers = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "Customer onboarding", description: "5-step onboarding owned by the Office Manager" } });
  const eBilling = await prisma.entity.create({ data: { organizationId: org.id, type: "PROCESS", name: "Job billing", description: "Invoice within 24 hours of completed job" } });
  const ePlans = await prisma.entity.create({ data: { organizationId: org.id, type: "POLICY", name: "Comfort Club", description: "Annual maintenance plan: 2 tune-ups, 15% off repairs, priority scheduling" } });
  const eWarranty = await prisma.entity.create({ data: { organizationId: org.id, type: "POLICY", name: "Warranty & refunds", description: "1-year labor warranty; 30-day refund window on unresolved repairs" } });
  await prisma.fact.createMany({
    data: [
      { organizationId: org.id, entityId: eCustomers.id, statement: "Onboarding is owned by the Office Manager (Priya Natarajan) and targets completion within 2 business days.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: eBilling.id, statement: "Company policy is to invoice every completed job within 24 hours.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: ePlans.id, statement: "Comfort Club target renewal rate is 90%+ and members slipping past 10 months must be called to re-book.", confidence: 0.9, status: "FACT" },
      { organizationId: org.id, entityId: eWarranty.id, statement: "Labor carries a 1-year warranty; refunds require Office Manager approval.", confidence: 0.95, status: "FACT" },
      { organizationId: org.id, entityId: ePlans.id, statement: "Comfort Club membership is assumed to be the primary driver of repeat revenue, but per-member revenue attribution is not yet tracked.", confidence: 0.5, status: "ASSUMPTION" },
    ],
  });

  // ── Enhance: brand assets ──
  await prisma.brandAsset.createMany({
    data: [
      { organizationId: org.id, name: "Primary logo — full color", kind: "LOGO", description: "Vertical lockup, mountain mark, navy + orange. Approved 2025 refresh." },
      { organizationId: org.id, name: "Brand guidelines v2.1", kind: "GUIDELINE", description: "Colors (navy #232C49, orange #F97316, blue #3B82F6), Inter typography, photo style: real technicians, no stock handshakes." },
      { organizationId: org.id, name: "Estimate template (letterhead)", kind: "TEMPLATE", description: "Branded estimate layout with approval signature block." },
      { organizationId: org.id, name: "Fall tune-up social kit", kind: "SOCIAL", description: "3 posts + 1 short video script promoting fall furnace tune-ups for Comfort Club." },
    ],
  });

  // ── Innovation Lab ──
  await prisma.idea.createMany({
    data: [
      {
        organizationId: org.id, title: "Whole-home generator installation line",
        problem: "Storm outages are the #1 complaint in rural edges of our service area; we currently refer that work out and lose the customer.",
        hypothesis: "Offering 22kW generator installs with a financing partner captures referred-out revenue and adds a $8k+ average ticket.",
        proposedSolution: "Certify Alicia for generator installs, partner with one distributor, pilot with the 40 customers who asked about backup power.",
        evidence: "4 generator inquiries logged in the last 90 days; zero current capability.",
        owner: "Alicia Grant", status: "EXPERIMENTING",
        nextStep: "Distributor pricing call Friday; pilot offer to inquiry list.",
      },
      {
        organizationId: org.id, title: "Comfort Club member referral program",
        problem: "Most new customers come from word of mouth, but we have never formalized or rewarded referrals.",
        hypothesis: "A $50 service credit for both parties increases member-originated leads without paid ads.",
        proposedSolution: "Give-both-ways credit, tracked per member, mentioned at every tune-up.",
        evidence: "Informal survey: 6 of 12 new customers last quarter were referred by existing customers.",
        owner: "Priya Natarajan", status: "IDEA",
        nextStep: "Draft one-page program and test with 10 members.",
      },
      {
        organizationId: org.id, title: "Two-tech crews for large installs",
        problem: "Large AC installs take two days with one tech, delaying other jobs.",
        hypothesis: "Two-tech crews cut install time ~40% and improve same-week capacity.",
        proposedSolution: "Pilot on the next 3 replacement installs with Jake + Dev.",
        evidence: "Time logs from last 5 single-tech installs average 14.5 hours.",
        owner: "Marcus Lee", status: "IDEA",
        nextStep: "Schedule pilot on next replacement job.",
      },
    ],
  });

  // ── Expand: training ──
  const t1 = await prisma.trainingModule.create({
    data: {
      organizationId: org.id, title: "Same-day job logging (why it matters)",
      summary: "How complete job logs enable 24-hour invoicing and protect revenue.",
      category: "PROCESS", source: "AI_GENERATED",
      content: "Generated from company knowledge: 'Job logging requirement' and 'Job billing' records.\n\n1. Every job must be logged before leaving the site — notes, parts, time.\n2. Unbilled completed jobs are the single largest recoverable revenue leak.\n3. Walk through the job logging screen with examples.\n4. Quiz: what happens if a job is not logged same-day?",
      knowledgeRefs: "[]",
    },
  });
  const t2 = await prisma.trainingModule.create({
    data: {
      organizationId: org.id, title: "Comfort Club renewal conversations",
      summary: "How to talk about renewals and annual visits without being pushy.",
      category: "CUSTOMER", source: "AI_GENERATED",
      content: "Generated from company knowledge: 'Comfort Club renewal rules'.\n\n1. Renewal target is 90%+ — renewals are the core of recurring revenue.\n2. Script for re-booking members past 10 months.\n3. Handling the 'I didn't use it' objection with the 15%-off value math.",
      knowledgeRefs: "[]",
    },
  });
  await prisma.trainingAssignment.createMany({
    data: [
      { trainingId: t1.id, employeeId: dev.id, status: "IN_PROGRESS" },
      { trainingId: t1.id, employeeId: sofia.id, status: "COMPLETED" },
      { trainingId: t2.id, employeeId: priya.id, status: "ASSIGNED" },
    ],
  });

  // ── Projects ──
  await prisma.project.create({
    data: {
      organizationId: org.id, title: "Generator offering launch",
      description: "Certification, distributor partnership, pilot installs.",
      status: "ACTIVE", dueAt: daysFromNow(45),
    },
  });

  // ── Connected Ecosystem (clearly labeled DEMO / AVAILABLE) ──
  await prisma.integration.createMany({
    data: [
      { organizationId: org.id, key: "quickbooks", name: "QuickBooks Online", category: "ACCOUNTING", status: "DEMO", dataAvailable: "Demo: invoices, payments and customer records shown in CUE are a local mirror.", capabilities: "Real connection would let CUE read invoices/payments live and draft invoices for your review." },
      { organizationId: org.id, key: "google_calendar", name: "Google Calendar", category: "SCHEDULING", status: "DEMO", dataAvailable: "Demo: job schedule shown in CUE is local data.", capabilities: "Real connection would sync scheduled jobs and technician calendars." },
      { organizationId: org.id, key: "gmail", name: "Gmail", category: "EMAIL", status: "DEMO", dataAvailable: "Demo: the communication timeline is seeded locally.", capabilities: "Real connection would log customer emails automatically against their record." },
      { organizationId: org.id, key: "servicetitan", name: "ServiceTitan", category: "CRM", status: "AVAILABLE", dataAvailable: "Not connected. Field service CRM — jobs, estimates, customers.", capabilities: "Would replace CUE's demo job/estimate data with the live system of record." },
      { organizationId: org.id, key: "stripe", name: "Stripe", category: "PAYMENTS", status: "AVAILABLE", dataAvailable: "Not connected. Card/ACH payments and payouts.", capabilities: "Would show collected revenue in real time and enable payment links on invoices." },
      { organizationId: org.id, key: "gustavo_hr", name: "Gusto", category: "HR", status: "AVAILABLE", dataAvailable: "Not connected. Payroll, org structure, PTO.", capabilities: "Would sync employees, departments and time off into People." },
      { organizationId: org.id, key: "google_drive", name: "Google Drive", category: "STORAGE", status: "AVAILABLE", dataAvailable: "Not connected. Documents and spreadsheets.", capabilities: "Would import and classify existing company documents into Capture." },
      { organizationId: org.id, key: "housecall_pro", name: "Housecall Pro", category: "CRM", status: "AVAILABLE", dataAvailable: "Not connected. Jobs, invoicing, customer communications.", capabilities: "Alternative field-service source of record for jobs and estimates." },
    ],
  });

  // ── AI settings (human control defaults) ──
  await prisma.aiSettings.create({
    data: { organizationId: org.id, observe: true, recommend: true, prepare: true, execute: false, automate: false },
  });

  // ── Seed audit event ──
  await prisma.auditEvent.create({
    data: {
      organizationId: org.id, actorType: "SYSTEM", action: "DEMO_SEEDED",
      detail: "Summit Home Services demo workspace created with seeded business data.",
    },
  });

  // ── Run the intelligence engine on the seeded data ──
  const { refreshIntelligence } = await import("../src/lib/intelligence");
  const created = await refreshIntelligence(org.id);
  console.log(`Seeded. Intelligence engine produced ${created} insight(s).`);
  console.log(`Sign in: owner@summithome.demo / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
