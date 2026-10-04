/**
 * Verifies Money on the Table + Impact Receipts compute real values.
 * Run: npx tsx scripts/test-impact.ts
 */
import { prisma } from "../src/lib/prisma";
import { computeMoneyOnTheTable, computeImpactReceipts } from "../src/lib/impact";

async function main() {
  for (const org of await prisma.organization.findMany()) {
    const money = await computeMoneyOnTheTable(org.id);
    const receipts = await computeImpactReceipts(org.id);
    const members = await prisma.member.findMany({ where: { organizationId: org.id }, include: { user: true } });

    console.log(`\n=== ${org.name} (${members[0]?.user.email ?? "no user"}) ===`);
    console.log(`Money on the table: $${money.total.toLocaleString()} across ${money.openInsightCount} open insight(s)`);
    for (const b of money.breakdown.slice(0, 4)) {
      console.log(`  ${b.amount > 0 ? "$" + Math.round(b.amount).toLocaleString() : "  —   "} ${b.label}`);
    }
    console.log(`Impact receipts: ${receipts.length}`);
    for (const r of receipts.slice(0, 3)) {
      console.log(`  [${r.status}] ${r.workflowTitle} — ${r.story}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
