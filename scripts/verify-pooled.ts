/** Verifies a pooled Supabase connection: counts orgs + users. */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const [orgs, users, leads, signals] = await Promise.all([
    prisma.organization.findMany({ select: { name: true, ingestKey: true } }),
    prisma.user.count(),
    prisma.lead.count(),
    prisma.marketSignal.count(),
  ]);
  console.log("orgs:", orgs.map((o) => o.name));
  console.log("users:", users, "| leads:", leads, "| signals:", signals);
  console.log("ingest keys present:", orgs.every((o) => !!o.ingestKey));
  await prisma.$disconnect();
}
main().catch((e) => { console.error("POOLED FAIL:", e.message.slice(0, 200)); process.exit(1); });
