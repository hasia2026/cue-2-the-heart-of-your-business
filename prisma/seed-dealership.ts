import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const d = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  console.log("Seeding CUE dealership Industry Pack — Riverside Auto Group…");

  // Additive seed: only wipe the Riverside org (leaves Summit Home Services intact)
  const existing = await prisma.organization.findFirst({ where: { name: "Riverside Auto Group" } });
  if (existing) {
    const orgId = existing.id;
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.workflow.deleteMany({ where: { organizationId: orgId } });
    await prisma.recommendation.deleteMany({ where: { organizationId: orgId } });
    await prisma.insight.deleteMany({ where: { organizationId: orgId } });
    await prisma.fact.deleteMany({ where: { organizationId: orgId } });
    await prisma.entity.deleteMany({ where: { organizationId: orgId } });
    await prisma.knowledgeItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceOrder.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.communication.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.message.deleteMany({ where: { thread: { organizationId: orgId } } });
    await prisma.threadParticipant.deleteMany({ where: { thread: { organizationId: orgId } } });
    await prisma.messageThread.deleteMany({ where: { organizationId: orgId } });
    await prisma.marketSignal.deleteMany({ where: { organizationId: orgId } });
    await prisma.gbpReview.deleteMany({ where: { organizationId: orgId } });
    await prisma.marketWatch.deleteMany({ where: { organizationId: orgId } });
    await prisma.lessonProgress.deleteMany({ where: { lesson: { organizationId: orgId } } });
    await prisma.lessonQuiz.deleteMany({ where: { lesson: { organizationId: orgId } } });
    await prisma.trainingLesson.deleteMany({ where: { organizationId: orgId } });
    await prisma.trainingAssignment.deleteMany({ where: { employee: { organizationId: orgId } } });
    await prisma.trainingModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.employee.deleteMany({ where: { organizationId: orgId } });
    await prisma.department.deleteMany({ where: { organizationId: orgId } });
    await prisma.brandAsset.deleteMany({ where: { organizationId: orgId } });
    await prisma.idea.deleteMany({ where: { organizationId: orgId } });
    await prisma.integration.deleteMany({ where: { organizationId: orgId } });
    await prisma.aiSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.goal.deleteMany({ where: { profile: { organizationId: orgId } } });
    await prisma.businessProfile.deleteMany({ where: { organizationId: orgId } });
    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.user.deleteMany({ where: { email: "gm@riversideauto.demo" } });

  const user = await prisma.user.create({
    data: { email: "gm@riversideauto.demo", name: "Vic Moreno", passwordHash: hashPassword("demo1234") },
  });
  const org = await prisma.organization.create({ data: { name: "Riverside Auto Group", isDemo: true } });
  await prisma.member.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });

  await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      name: "Riverside Auto Group",
      industry: "Automotive dealership — new & used, service, parts",
      size: "11-50",
      locations: "Riverside, CA — one rooftop, 3 franchises",
      businessModel: "New and used vehicle sales, F&I products, fixed-operations service drive, parts",
      offerings: "New vehicle sales\nUsed vehicle sales\nCertified pre-owned\nFinance & insurance\nService drive\nCollision referral\nParts counter",
      targetCustomers: "Local drivers, first-time buyers, families, small business fleets",
      mission: "The easiest place to buy and keep a car in the Inland Empire — transparent pricing, no games.",
      values: "Price it right the first time\nAnswer every lead in under 15 minutes\nService the customer for life\nRespect every customer's time",
      operationalPriorities: "Respond to every lead in 15 minutes\nFollow up every unsold deal within 48 hours\nInvoice completed service within 24 hours\nKeep reconditioning under 5 days",
      onboardingStep: 10,
    },
  });

  // Departments / staff
  const sales = await prisma.department.create({ data: { organizationId: org.id, name: "Sales", description: "New & used vehicle sales" } });
  const service = await prisma.department.create({ data: { organizationId: org.id, name: "Service", description: "Service drive and technician bays" } });
  const office = await prisma.department.create({ data: { organizationId: org.id, name: "Office & F&I", description: "Finance, insurance, title, accounting" } });
  const leadership = await prisma.department.create({ data: { organizationId: org.id, name: "Leadership" } });

  const vic = await prisma.employee.create({ data: { organizationId: org.id, name: "Vic Moreno", title: "General Manager", departmentId: leadership.id, email: "gm@riversideauto.demo", skills: "Dealership ops, desking, vendor management", responsibilities: "P&L, pricing strategy, staffing", hireDate: d(-2200) } });
  const tony = await prisma.employee.create({ data: { organizationId: org.id, name: "Tonya Parks", title: "Sales Manager", departmentId: sales.id, managerId: vic.id, skills: "Desking, trade appraisal, lender relations", responsibilities: "Deal approvals, sales floor, lead assignment", hireDate: d(-1400) } });
  const chris = await prisma.employee.create({ data: { organizationId: org.id, name: "Chris Alam", title: "Salesperson", departmentId: sales.id, managerId: tony.id, skills: "New vehicles, follow-up, demos", responsibilities: "New-vehicle sales, lead follow-up", hireDate: d(-500) } });
  const monica = await prisma.employee.create({ data: { organizationId: org.id, name: "Monica Reyes", title: "Salesperson", departmentId: sales.id, managerId: tony.id, skills: "Used vehicles, online leads, trade-ins", responsibilities: "Used-vehicle sales, internet leads", hireDate: d(-320) } });
  const sam = await prisma.employee.create({ data: { organizationId: org.id, name: "Sam Okafor", title: "Service Manager", departmentId: service.id, managerId: vic.id, skills: "Service ops, technician scheduling, warranty", responsibilities: "Service drive, dispatch, warranty claims", hireDate: d(-1100) } });
  const leah = await prisma.employee.create({ data: { organizationId: org.id, name: "Leah Kim", title: "F&I Manager", departmentId: office.id, managerId: vic.id, skills: "Lender menu, compliance, title", responsibilities: "Deal contracts, lender menu, title & registration", hireDate: d(-900) } });

  // Customers
  const mkC = (name: string, email: string, phone: string, type = "RESIDENTIAL", plan: string | null = null) =>
    prisma.customer.create({ data: { organizationId: org.id, name, email, phone, type, servicePlan: plan, address: "Riverside, CA" } });
  const cDiaz = await mkC("Marcus & Jenna Diaz", "diaz.family@example.com", "(951) 555-0134");
  const cTran = await mkC("Linda Tran", "linda.tran@example.com", "(951) 555-0177");
  const cCortez = await mkC("Rafael Cortez", "r.cortez@example.com", "(951) 555-0128");
  const cBright = await mkC("Bright Fleet Leasing", "fleet@brightfleet.example.com", "(951) 555-0190", "COMMERCIAL", "Fleet service agreement");
  const cNowak = await mkC("Peter Nowak", "p.nowak@example.com", "(951) 555-0155");
  const cAli = await mkC("Sara Ali", "sara.ali@example.com", "(951) 555-0161");

  // ── Inventory ──
  const mkV = (stock: string, year: number, make: string, model: string, trim: string, kind: string, status: string, list: number, cost: number, listed: number) =>
    prisma.vehicle.create({
      data: { organizationId: org.id, stockNumber: stock, vin: `VIN${stock}0000DEMO`, year, make, model, trim, kind, status, listPrice: list, cost, listedAt: d(listed) },
    });

  const v1 = await mkV("T2401", 2024, "Toyota", "Camry", "SE", "NEW", "AVAILABLE", 31400, 29600, -6);
  const v2 = await mkV("T2402", 2024, "Toyota", "RAV4", "XLE", "NEW", "AVAILABLE", 34900, 32800, -4);
  await mkV("T2403", 2024, "Toyota", "Tacoma", "SR5", "NEW", "IN_TRANSIT", 41200, 38900, -1);
  const v4 = await mkV("U1188", 2021, "Honda", "Accord", "Sport", "USED", "AVAILABLE", 26800, 23400, -21);
  const v5 = await mkV("U1175", 2020, "Ford", "F-150", "XLT", "USED", "AVAILABLE", 34500, 30100, -34);
  const v6 = await mkV("U1190", 2022, "Tesla", "Model 3", "RWD", "USED", "AVAILABLE", 31900, 28700, -18);
  const v7 = await mkV("U1193", 2019, "Jeep", "Cherokee", "Latitude", "USED", "AVAILABLE", 19900, 17400, -47); // aging
  await mkV("U1160", 2018, "Chevrolet", "Equinox", "LT", "USED", "SOLD", 17800, 15600, -60);

  // ── Deals ──
  // Leakage pattern: 4 deals stuck in NEGOTIATING with no follow-up (unsold pipeline)
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cDiaz.id, vehicleId: v4.id, dealType: "USED", status: "NEGOTIATING", amount: 26800, createdAt: d(-9) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cTran.id, vehicleId: v6.id, dealType: "USED", status: "NEGOTIATING", amount: 31900, createdAt: d(-7) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cCortez.id, vehicleId: v5.id, dealType: "USED", status: "NEGOTIATING", amount: 34500, createdAt: d(-6) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cNowak.id, vehicleId: v1.id, dealType: "NEW", status: "NEGOTIATING", amount: 31400, createdAt: d(-4) } });
  // F&I leakage: deals stuck awaiting finance
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cAli.id, vehicleId: v2.id, dealType: "NEW", status: "PENDING_FINANCE", amount: 34900, financeSentAt: d(-3) } });
  // Healthy wins
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cBright.id, vehicleId: v6.id, dealType: "USED", status: "WON", amount: 31900, closedAt: d(-12) } });
  await prisma.deal.create({ data: { organizationId: org.id, customerId: cDiaz.id, dealType: "USED", status: "WON", amount: 17800, closedAt: d(-25) } });

  // ── Service orders ──
  // Leakage: 5 completed, not invoiced — $2,340
  const soData: [any, any, string, number, number, number][] = [
    [cDiaz, null, "Oil change + tire rotation", 189, -6, -6],
    [cTran, v6, "Brake pads & rotors — front", 780, -8, -8],
    [cCortez, v5, "State safety inspection", 95, -5, -5],
    [cBright, null, "Fleet service — 3 vehicles", 990, -9, -9],
    [cNowak, v1, "Battery replacement + alignment", 286, -4, -4],
  ];
  for (const [cust, veh, title, amount, opened, done] of soData) {
    await prisma.serviceOrder.create({
      data: { organizationId: org.id, customerId: cust.id, vehicleId: veh?.id ?? null, title, amount, status: "COMPLETED", openedAt: d(opened), completedAt: d(done) },
    });
  }
  // Open service orders
  await prisma.serviceOrder.create({ data: { organizationId: org.id, customerId: cAli.id, vehicleId: v2.id, title: "Warranty diagnostics — infotainment", status: "IN_PROGRESS", amount: 0, openedAt: d(-2) } });
  await prisma.serviceOrder.create({ data: { organizationId: org.id, customerId: cTran.id, vehicleId: v6.id, title: "Waiting on parts — charging port", status: "AWAITING_PARTS", amount: 430, openedAt: d(-5) } });

  // ── Communication history (feeds customer 360 timelines + health) ──
  await prisma.communication.createMany({
    data: [
      { organizationId: org.id, customerId: cDiaz.id, channel: "PHONE", direction: "OUTBOUND", summary: "Test drive follow-up — they liked the Accord Sport, waiting on trade payoff number.", occurredAt: d(-8) },
      { organizationId: org.id, customerId: cDiaz.id, channel: "EMAIL", direction: "OUTBOUND", summary: "Sent updated out-the-door quote with the 1.9% APR offer attached.", occurredAt: d(-6) },
      { organizationId: org.id, customerId: cTran.id, channel: "IN_PERSON", direction: "INBOUND", summary: "Dropped off the Model 3 for brakes; also mentioned the charging port — opened a second order.", occurredAt: d(-8) },
      { organizationId: org.id, customerId: cBright.id, channel: "PHONE", direction: "OUTBOUND", summary: "Quarterly fleet check-in — 3 vans due for service next month.", occurredAt: d(-10) },
      { organizationId: org.id, customerId: cCortez.id, channel: "SMS", direction: "INBOUND", summary: "Asked if inspection passed — needs the car Friday for a road trip.", occurredAt: d(-4) },
    ],
  });

  // ── Leads ──
  // Missed leads: 6 NEW leads older than 24h with no contact (the dealership killer)
  const missedLeads: [string, string, string, number][] = [
    ["Jordan Whitfield", "WEB", "2024 RAV4 Hybrid", -3],
    ["Amara Osei", "PHONE", "Used SUV under $30k", -2],
    ["Diego Fuentes", "WEB", "Tacoma trade-in", -2],
    ["Hannah Lieu", "WEB", "Model 3 long range", -1],
    ["Robert Mendez", "PHONE", "Fleet quote — 4 vans", -1],
    ["Grace Okafor", "WALK_IN", "Camry lease vs buy", 0],
  ];
  for (const [name, source, interest, age] of missedLeads) {
    await prisma.lead.create({
      data: { organizationId: org.id, name, source, interest, estValue: 2800 + Math.round(Math.random() * 40) * 100, status: "NEW", createdAt: d(age - 0.5) },
    });
  }
  // Worked leads
  await prisma.lead.create({ data: { organizationId: org.id, name: "Kevin Brand", source: "REFERRAL", interest: "Accord Sport", estValue: 3100, status: "CONTACTED", assignedToId: monica.id, createdAt: d(-2), lastContactAt: d(-1) } });
  await prisma.lead.create({ data: { organizationId: org.id, name: "Priya Raman", source: "WEB", interest: "F-150 XLT", estValue: 4200, status: "QUALIFIED", assignedToId: chris.id, createdAt: d(-4), lastContactAt: d(-1) } });
  await prisma.lead.create({ data: { organizationId: org.id, name: "Owen Castillo", source: "WEB", interest: "Camry SE", estValue: 2600, status: "WON", assignedToId: chris.id, createdAt: d(-10), lastContactAt: d(-9) } });

  // ── Aged-vehicle notes as knowledge ──
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Reconditioning standard",
      content: "Trade-ins must be reconditioned and listed within 5 days of acquisition. Vehicles sitting unsold past 30 days get a price review every Monday (GM + used-car manager). Floorplan interest accrues daily on unsold inventory, so aging units cost roughly $22/day.",
      category: "PROCEDURE", tags: "recon,inventory,pricing,aging", status: "FACT",
    },
  });
  await prisma.knowledgeItem.create({
    data: {
      organizationId: org.id,
      title: "Lead response policy",
      content: "Every internet or phone lead must receive a response within 15 minutes during business hours — the single strongest predictor of close rate. Leads unanswered after 24 hours are flagged to the Sales Manager. Weekend leads are worked first thing Monday morning.",
      category: "PROCEDURE", tags: "leads,response,procedure,sales", status: "FACT",
    },
  });

  // ── Expand: training module with a lesson + mixed-type quiz ──
  const tModule = await prisma.trainingModule.create({
    data: {
      organizationId: org.id, title: "15-minute lead response (why it wins deals)",
      summary: "The response-time standard every salesperson is held to, and how to hit it.",
      category: "PROCESS", source: "AI_GENERATED",
      content: "Generated from company knowledge: 'Lead response policy'.\n\n1. Every internet or phone lead gets a response within 15 minutes during business hours.\n2. Fast response is the strongest predictor of close rate.\n3. Leads unanswered after 24 hours are flagged to the Sales Manager.\n4. Weekend leads are worked first thing Monday morning.",
      knowledgeRefs: "[]",
    },
  });
  const tLesson = await prisma.trainingLesson.create({
    data: {
      organizationId: org.id, moduleId: tModule.id, title: "The 15-minute rule", sort: 0, durationMin: 5,
      content: "Response speed decides who earns the appointment. A lead answered in 15 minutes is many times more likely to close than one answered the next day. The moment a lead lands: call, then text, then email. If you cannot reach them, book the next touch before you move on.",
    },
  });
  await prisma.lessonQuiz.create({
    data: {
      lessonId: tLesson.id, passingPct: 80,
      questions: JSON.stringify([
        { type: "SINGLE", q: "During business hours, how fast must a new lead get a response?", options: ["Within 15 minutes", "Same day", "Within 24 hours", "Whenever convenient"], answerIndex: 0 },
        { type: "MULTI", q: "Which are part of the first-touch sequence?", options: ["Call", "Text", "Email", "Wait for them to call back"], answerIndexes: [0, 1, 2] },
        { type: "FREE", q: "What happens to a lead still unanswered after 24 hours?", keywords: ["flagged", "sales manager", "flag"], sampleAnswer: "It is flagged to the Sales Manager." },
      ]),
    },
  });
  await prisma.trainingAssignment.createMany({
    data: [
      { trainingId: tModule.id, employeeId: chris.id, status: "IN_PROGRESS" },
      { trainingId: tModule.id, employeeId: monica.id, status: "ASSIGNED" },
    ],
  });

  // ── Messages: sales group thread + GM↔service direct, with unread items ──
  const salesThread = await prisma.messageThread.create({
    data: {
      organizationId: org.id, title: "Sales floor", isGroup: true,
      participants: { create: [
        { employeeId: tony.id },
        { employeeId: chris.id },
        { employeeId: monica.id, lastReadAt: d(-1) },
      ] },
    },
  });
  await prisma.message.create({ data: { threadId: salesThread.id, authorEmployeeId: tony.id, authorName: "Tonya Parks", body: "Reminder — every web lead gets a call inside 15 minutes. Two from the weekend are still untouched.", createdAt: d(-0.5) } });
  await prisma.message.create({ data: { threadId: salesThread.id, authorEmployeeId: chris.id, authorName: "Chris Alam", body: "On it — taking the RAV4 Hybrid and the Tacoma trade-in now.", createdAt: d(-0.4) } });

  const gmServiceThread = await prisma.messageThread.create({
    data: {
      organizationId: org.id, isGroup: false,
      participants: { create: [
        { employeeId: vic.id },
        { employeeId: sam.id, lastReadAt: d(-0.2) },
      ] },
    },
  });
  await prisma.message.create({ data: { threadId: gmServiceThread.id, authorEmployeeId: sam.id, authorName: "Sam Okafor", body: "Vic — charging-port part lands Thursday. Loaner is already promised to Mr. Tran, so no upsell risk on that one.", createdAt: d(-0.1) } });

  // ── Market Signals: saved watches + a triage-ready demo inbox ──
  const wBuyers = await prisma.marketWatch.create({
    data: {
      organizationId: org.id, name: "Local truck & SUV buyers",
      keywords: "looking to buy a truck, shopping for a pickup, in the market for an suv, looking to buy a car",
      geography: "Riverside, CA", sourceHint: "Reddit + Nextdoor via Brand24",
    },
  });
  const wSellers = await prisma.marketWatch.create({
    data: {
      organizationId: org.id, name: "Sell-my-car conversations",
      keywords: "sell my car, selling my tacoma, trade in my suv, cash for cars",
      geography: "Inland Empire, CA", sourceHint: "Reddit + RSS bridge",
    },
  });
  await prisma.marketWatch.create({
    data: {
      organizationId: org.id, name: "Service & repair chatter",
      keywords: "dealership service, oil change near me, check engine, wont upsell me",
      geography: "Riverside, CA", sourceHint: "Neighborhood groups",
    },
  });

  await prisma.marketSignal.createMany({
    data: [
      {
        organizationId: org.id, watchId: wBuyers.id, source: "WEBHOOK",
        externalId: "reddit-abc123", externalUrl: "https://www.reddit.com/r/Riverside/comments/abc123",
        author: "Marcus_T_95", intent: "BUY", matchedKeywords: "looking to buy a truck",
        title: "Anyone in Riverside selling a full-size pickup?",
        content: "Looking to buy a truck in the next two weeks — nothing fancy, maybe a 2018+ F-150 or Silverado. Which dealers near Riverside actually give honest pricing? Tired of the runaround.",
        fingerprint: "seed-signal-1", receivedAt: d(-0.4), status: "NEW",
      },
      {
        organizationId: org.id, watchId: wSellers.id, source: "RSS",
        author: "DanaK_wv", intent: "SELL", matchedKeywords: "selling my tacoma",
        title: "Finally selling my Tacoma — where should I take it?",
        content: "Selling my 2020 Tacoma TRD this month. Not looking for private-party hassle — who buys trucks around the Inland Empire and gives a fair trade number without lowballing?",
        fingerprint: "seed-signal-2", receivedAt: d(-0.8), status: "NEW",
      },
      {
        organizationId: org.id, source: "WEBHOOK",
        author: "rvnca_", intent: "SERVICE",
        title: "Check engine light — dealership service near Riverside?",
        content: "Check engine came on my Passport. Is there dealership service around Riverside that actually diagnoses before selling you parts?",
        fingerprint: "seed-signal-3", receivedAt: d(-2), status: "REVIEWED",
      },
    ],
  });
  // One already-converted signal so the demo shows the full lifecycle
  const jaimeLead = await prisma.lead.create({
    data: { organizationId: org.id, name: "Jaime Orozco", source: "MARKET", interest: "Market: trade-in SUV + used SUV under $30k", status: "NEW" },
  });
  await prisma.marketSignal.create({
    data: {
      organizationId: org.id, watchId: wSellers.id, source: "WEBHOOK",
      author: "Jaime_orozco", intent: "SELL", matchedKeywords: "trade in my suv",
      title: "Trading in my SUV this weekend",
      content: "Trading in my SUV this weekend and shopping used SUVs under $30k. Does Riverside Auto take trade-ins without an appointment?",
      fingerprint: "seed-signal-4", receivedAt: d(-3), status: "CONVERTED_LEAD", convertedLeadId: jaimeLead.id,
    },
  });

  // ── Google Business Profile: reviews + a message via the real ingest lib ──
  const { ingestGbp } = await import("../src/lib/signals");
  await ingestGbp(org.id, [
    {
      externalId: "seed-gbp-1", authorName: "Sarah M.", rating: 5,
      body: "Best service experience I've had — in and out in an hour for my 30k maintenance, and they washed the car. Ask for Leah in F&I if you're buying.",
      postedAt: d(-4),
    },
    {
      externalId: "seed-gbp-2", authorName: "Devon P.", rating: 2,
      body: "Waited 45 minutes past my appointment for an oil change. Nobody updated me. Front desk was friendly when I finally got seen, but the wait was rough.",
      postedAt: d(-1),
    },
    {
      externalId: "seed-gbp-3", authorName: "Anita R.", rating: 4,
      body: "Bought a used CR-V here. Process took longer than expected but the price was fair and there were no surprises on the paperwork.",
      postedAt: d(-0.5),
    },
    {
      externalId: "seed-gbp-4", kind: "MESSAGE", authorName: "Tom W.",
      body: "Hi — do you buy used trucks that aren't trade-in ready? I have a 2016 Silverado with 120k miles and want a quick appraisal.",
      postedAt: d(-0.2),
    },
  ]);
  // Sarah's review already got a response
  const sarah = await prisma.gbpReview.findFirst({ where: { organizationId: org.id, externalId: "seed-gbp-1" } });
  if (sarah) {
    await prisma.gbpReview.update({
      where: { id: sarah.id },
      data: {
        status: "REPLIED", respondedAt: d(-3.5),
        responseText: "Thank you, Sarah! Glad the team took care of you — the wash is on us anytime. Enjoy the CR-V.",
      },
    });
  }

  await prisma.aiSettings.create({ data: { organizationId: org.id } });

  await prisma.auditEvent.create({
    data: { organizationId: org.id, actorType: "SYSTEM", action: "DEMO_SEEDED", detail: "Riverside Auto Group dealership demo workspace created." },
  });

  const { refreshIntelligence } = await import("../src/lib/intelligence");
  const created = await refreshIntelligence(org.id);
  console.log(`Dealership seed complete. Intelligence engine produced ${created} insight(s).`);
  console.log("Sign in: gm@riversideauto.demo / demo1234");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
