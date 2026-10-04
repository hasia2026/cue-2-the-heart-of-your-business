import { computeBriefing } from "../src/lib/briefing";
import { prisma } from "../src/lib/prisma";

async function main() {
  const m = await prisma.member.findFirst({ where: { user: { email: "owner@summithome.demo" } } });
  if (!m) throw new Error("no member");
  const b = await computeBriefing(m.organizationId);
  console.log("headline:", b.headline);
  console.log("lines:", b.lines.map((l) => l.text));
  await prisma.$disconnect();
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
