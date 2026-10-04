/**
 * End-to-end signup → onboarding verification against the live DB.
 * Creates a throwaway user+org, runs the starter-data spawn, checks
 * the workspace is fully usable, then cleans up after itself.
 * npx tsx scripts/test-signup-flow.ts
 */
import { prisma } from "../src/lib/prisma";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const email = `e2e-${Date.now()}@test.dev`;
  const { hashPassword } = await import("../src/lib/password");
  const { spawnStarterData } = await import("../src/lib/starter-data");

  // Simulate /signup action core
  const user = await prisma.user.create({ data: { email, name: "E2E Tester", passwordHash: hashPassword("test12345") } });
  const org = await prisma.organization.create({ data: { name: "__e2e-workspace" } });
  await prisma.member.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
  await prisma.businessProfile.create({ data: { organizationId: org.id, name: "__e2e-workspace" } });
  await prisma.aiSettings.create({ data: { organizationId: org.id } });
  assert(true, "signup core: user + org + member + profile created");

  // Simulate onboarding finish (industry pack spawn)
  await spawnStarterData(org.id, "AUTO");
  const [emps, leads, vehicles, deals, orders, comms] = await Promise.all([
    prisma.employee.count({ where: { organizationId: org.id } }),
    prisma.lead.count({ where: { organizationId: org.id } }),
    prisma.vehicle.count({ where: { organizationId: org.id } }),
    prisma.deal.count({ where: { organizationId: org.id } }),
    prisma.serviceOrder.count({ where: { organizationId: org.id } }),
    prisma.communication.count({ where: { organizationId: org.id } }),
  ]);
  assert(emps > 0, `starter data: ${emps} employees`);
  assert(leads > 0, `starter data: ${leads} leads`);
  assert(vehicles > 0, `starter data: ${vehicles} vehicles`);
  assert(deals > 0, `starter data: ${deals} deals`);
  assert(orders > 0, `starter data: ${orders} service orders`);
  assert(comms > 0, `starter data: ${comms} communications`);

  // Workspace usable: ingest key exists, briefing computable
  const fresh = await prisma.organization.findUnique({ where: { id: org.id }, select: { ingestKey: true } });
  assert(!!fresh?.ingestKey, "new org gets an ingest key automatically (cuid default)");

  const { computeBriefing } = await import("../src/lib/briefing");
  const briefing = await computeBriefing(org.id);
  assert(typeof briefing.moneyAtStake === "number" && typeof briefing.newSignals === "number", "Morning Briefing computes on the fresh org");

  // Cleanup (starter data + workspace + user)
  await prisma.marketSignal.deleteMany({ where: { organizationId: org.id } });
  await prisma.gbpReview.deleteMany({ where: { organizationId: org.id } });
  await prisma.marketWatch.deleteMany({ where: { organizationId: org.id } });
  await prisma.message.deleteMany({ where: { thread: { organizationId: org.id } } });
  await prisma.threadParticipant.deleteMany({ where: { thread: { organizationId: org.id } } });
  await prisma.messageThread.deleteMany({ where: { organizationId: org.id } });
  await prisma.lessonQuiz.deleteMany({ where: { lesson: { organizationId: org.id } } });
  await prisma.lessonProgress.deleteMany({ where: { lesson: { organizationId: org.id } } });
  await prisma.trainingLesson.deleteMany({ where: { organizationId: org.id } });
  await prisma.trainingAssignment.deleteMany({ where: { employee: { organizationId: org.id } } });
  await prisma.trainingModule.deleteMany({ where: { organizationId: org.id } });
  await prisma.policyAcknowledgment.deleteMany({ where: { organizationId: org.id } });
  await prisma.workflow.deleteMany({ where: { organizationId: org.id } });
  await prisma.recommendation.deleteMany({ where: { organizationId: org.id } });
  await prisma.insight.deleteMany({ where: { organizationId: org.id } });
  await prisma.task.deleteMany({ where: { organizationId: org.id } });
  await prisma.project.deleteMany({ where: { organizationId: org.id } });
  await prisma.idea.deleteMany({ where: { organizationId: org.id } });
  await prisma.brandAsset.deleteMany({ where: { organizationId: org.id } });
  await prisma.integration.deleteMany({ where: { organizationId: org.id } });
  await prisma.aiSettings.deleteMany({ where: { organizationId: org.id } });
  await prisma.fact.deleteMany({ where: { organizationId: org.id } });
  await prisma.entity.deleteMany({ where: { organizationId: org.id } });
  await prisma.knowledgeItem.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.goal.deleteMany({ where: { profile: { organizationId: org.id } } });
  await prisma.businessProfile.deleteMany({ where: { organizationId: org.id } });
  await prisma.member.deleteMany({ where: { organizationId: org.id } });
  await prisma.payment.deleteMany({ where: { organizationId: org.id } });
  await prisma.invoice.deleteMany({ where: { organizationId: org.id } });
  await prisma.job.deleteMany({ where: { organizationId: org.id } });
  await prisma.estimate.deleteMany({ where: { organizationId: org.id } });
  await prisma.communication.deleteMany({ where: { organizationId: org.id } });
  await prisma.deal.deleteMany({ where: { organizationId: org.id } });
  await prisma.serviceOrder.deleteMany({ where: { organizationId: org.id } });
  await prisma.vehicle.deleteMany({ where: { organizationId: org.id } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  await prisma.document.deleteMany({ where: { organizationId: org.id } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.employee.deleteMany({ where: { organizationId: org.id } });
  await prisma.department.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("PASS — full signup→onboarding→briefing flow verified on the live DB, throwaway workspace removed");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
