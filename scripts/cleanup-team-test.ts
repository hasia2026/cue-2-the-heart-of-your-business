/** One-off: purge team-test leftovers. */
import { prisma } from "../src/lib/prisma";
async function main() {
  const orgs = await prisma.organization.findMany({ where: { name: { startsWith: "__test-team" } }, select: { id: true } });
  for (const o of orgs) {
    await prisma.auditEvent.deleteMany({ where: { organizationId: o.id } });
    await prisma.member.deleteMany({ where: { organizationId: o.id } });
    await prisma.organization.delete({ where: { id: o.id } });
  }
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@team.test" } }, select: { id: true } });
  for (const u of users) await prisma.user.delete({ where: { id: u.id } });
  console.log(`purged ${orgs.length} org(s), ${users.length} user(s)`);
  await prisma.$disconnect();
}
main();
