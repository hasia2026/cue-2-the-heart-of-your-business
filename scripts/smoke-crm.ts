/**
 * HTTP smoke for the CRM Pipeline pages against the live dev server.
 * Dev server must be up: npx tsx scripts/smoke-crm.ts
 */
import { createHmac } from "crypto";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:3210";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "gm@riversideauto.demo" } });
  if (!user) throw new Error("demo user missing — run prisma/seed-dealership.ts");
  const secret = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
  const expires = Date.now() + 3_600_000;
  const cookie = `cue_session=${user.id}.${expires}.${createHmac("sha256", secret).update(`${user.id}.${expires}`).digest("hex")}`;
  const get = async (path: string) => (await fetch(`${BASE}${path}`, { headers: { cookie } })).text();

  const demo = await prisma.organization.findFirst({ where: { name: "Riverside Auto Group" } });
  if (!demo) throw new Error("demo org missing");
  const lead = await prisma.lead.findFirst({ where: { organizationId: demo.id, status: "NEW" }, orderBy: { createdAt: "asc" } });
  const cust = await prisma.customer.findFirst({ where: { organizationId: demo.id } });
  if (!lead || !cust) throw new Error("demo lead/customer missing");

  const page = await get("/pipeline");
  assert(page.includes("Pipeline"), "/pipeline renders");
  assert(page.includes("need response"), "leads-waiting badge present");
  assert(page.includes("Market signal"), "market-signal source badge visible in inbox");
  assert(page.includes("CSV import") || page.includes("Walk-in"), "other sources render");
  assert(/NEGOTIATING|Pending finance/i.test(page), "deal kanban columns render");

  const leadPage = await get(`/pipeline/lead/${lead.id}`);
  assert(leadPage.includes(lead.name), "lead detail renders name");
  assert(leadPage.includes("rule broken") || leadPage.includes("respond within"), "response-time flag renders");
  assert(leadPage.includes("Log a contact"), "contact logger present");
  assert(!leadPage.includes("open signal inbox"), "no origin card for non-signal lead");

  const sigLead = await prisma.lead.findFirst({ where: { organizationId: demo.id, source: "MARKET" } });
  if (sigLead) {
    const sigPage = await get(`/pipeline/lead/${sigLead.id}`);
    assert(sigPage.includes("Origin"), "signal-originated lead shows Origin card");
    assert(sigPage.includes("open signal inbox"), "deep-link back to /signals present");
  }

  const custPage = await get(`/pipeline/customer/${cust.id}`);
  const decoded = custPage.replace(/&amp;/g, "&");
  assert(decoded.includes(cust.name), "customer 360 renders name");
  assert(custPage.includes("lifetime value"), "360 stats render");
  assert(custPage.includes("Log a touch"), "one-click contact logger present");
  assert(custPage.includes("Communication timeline"), "timeline present");

  console.log("PASS — Pipeline pages render over HTTP");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
