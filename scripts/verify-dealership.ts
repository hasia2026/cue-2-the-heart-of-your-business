import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const org = await p.organization.findFirstOrThrow();
  const insights = await p.insight.findMany({ where: { organizationId: org.id } });
  for (const i of insights) console.log(i.severity.padEnd(7), String(i.impactValue ?? "-").padEnd(8), i.title);
  console.log("leads:", await p.lead.count({ where: { organizationId: org.id, status: "NEW" } }));
  console.log("deals negotiating:", await p.deal.count({ where: { organizationId: org.id, status: "NEGOTIATING" } }));
  console.log("service completed:", await p.serviceOrder.count({ where: { organizationId: org.id, status: "COMPLETED" } }));
  const vehicles = await p.vehicle.findMany({ where: { organizationId: org.id, status: "AVAILABLE" } });
  console.log("aged 30d+:", vehicles.filter((v) => v.listedAt && Date.now() - v.listedAt.getTime() > 30 * 86400000).length);
}
main().finally(() => p.$disconnect());
