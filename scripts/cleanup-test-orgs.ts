/** Removes leftover __test* scratch organizations (from failed test runs) and their children. */
import { prisma } from "../src/lib/prisma";

async function main() {
  const junk = await prisma.organization.findMany({ where: { name: { startsWith: "__test" } }, select: { id: true, name: true } });
  for (const org of junk) {
    const orgId = org.id;
    await prisma.marketSignal.deleteMany({ where: { organizationId: orgId } });
    await prisma.gbpReview.deleteMany({ where: { organizationId: orgId } });
    await prisma.marketWatch.deleteMany({ where: { organizationId: orgId } });
    await prisma.message.deleteMany({ where: { thread: { organizationId: orgId } } });
    await prisma.threadParticipant.deleteMany({ where: { thread: { organizationId: orgId } } });
    await prisma.messageThread.deleteMany({ where: { organizationId: orgId } });
    await prisma.lessonQuiz.deleteMany({ where: { lesson: { organizationId: orgId } } });
    await prisma.lessonProgress.deleteMany({ where: { lesson: { organizationId: orgId } } });
    await prisma.trainingLesson.deleteMany({ where: { organizationId: orgId } });
    await prisma.trainingAssignment.deleteMany({ where: { employee: { organizationId: orgId } } });
    await prisma.trainingModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.policyAcknowledgment.deleteMany({ where: { organizationId: orgId } });
    await prisma.workflow.deleteMany({ where: { organizationId: orgId } });
    await prisma.recommendation.deleteMany({ where: { organizationId: orgId } });
    await prisma.insight.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.idea.deleteMany({ where: { organizationId: orgId } });
    await prisma.brandAsset.deleteMany({ where: { organizationId: orgId } });
    await prisma.integration.deleteMany({ where: { organizationId: orgId } });
    await prisma.aiSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.fact.deleteMany({ where: { organizationId: orgId } });
    await prisma.entity.deleteMany({ where: { organizationId: orgId } });
    await prisma.knowledgeItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.goal.deleteMany({ where: { profile: { organizationId: orgId } } });
    await prisma.businessProfile.deleteMany({ where: { organizationId: orgId } });
    await prisma.member.deleteMany({ where: { organizationId: orgId } });
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
    await prisma.job.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.communication.deleteMany({ where: { organizationId: orgId } });
    await prisma.deal.deleteMany({ where: { organizationId: orgId } });
    await prisma.serviceOrder.deleteMany({ where: { organizationId: orgId } });
    await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.employee.deleteMany({ where: { organizationId: orgId } });
    await prisma.department.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    console.log("removed", org.name);
  }
  console.log(`Cleaned ${junk.length} scratch org(s).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
