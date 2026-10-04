import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const org = await p.organization.findFirstOrThrow();
  const insights = await p.insight.findMany({ where: { organizationId: org.id } });
  for (const i of insights) {
    console.log(i.severity.padEnd(7), String(i.impactValue ?? "-").padEnd(8), i.title);
  }
  const recs = await p.recommendation.findMany({ where: { organizationId: org.id } });
  console.log("recommendations:", recs.length, "| linked to insight:", recs.filter((r) => r.insightId).length);
}
main().finally(() => p.$disconnect());
