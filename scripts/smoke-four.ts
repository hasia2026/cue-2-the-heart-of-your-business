/**
 * Verifies the four new features render for an authenticated session.
 * Run with dev server up: npx tsx scripts/smoke-four.ts
 */
import { createHmac } from "crypto";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:3210";

function signSession(userId: string): string {
  const secret = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
  const expires = Date.now() + 1000 * 60 * 60 * 24;
  const payload = `${userId}.${expires}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "owner@summithome.demo" } });
  if (!user) throw new Error("demo user missing");
  const cookie = `cue_session=${signSession(user.id)}`;

  const checks: [string, boolean][] = [];

  const dash = await (await fetch(`${BASE}/dashboard`, { headers: { cookie } })).text();
  checks.push(["Briefing: Morning Briefing card", dash.includes("Morning Briefing")]);
  checks.push(["Briefing: headline money line", /sitting on the table/.test(dash)]);
  checks.push(["Hero: Money on the table", dash.includes("Money on the table")]);

  const compass = await (await fetch(`${BASE}/compass`, { headers: { cookie } })).text();
  checks.push(["Simulator: What-if simulator card", compass.includes("What-if simulator")]);
  checks.push(["Simulator: transparent math shown", /historical|acceptance|No estimate outcomes/.test(compass)]);

  const capture = await (await fetch(`${BASE}/capture`, { headers: { cookie } })).text();
  checks.push(["Import: CSV/DMS section", capture.includes("Import from a CSV / DMS report")]);

  const people = await (await fetch(`${BASE}/people`, { headers: { cookie } })).text();
  checks.push(["Compliance: policy section", people.includes("Policy compliance")]);
  checks.push(["Compliance: coverage badge", /acknowledged/.test(people)]);

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failed++;
  }
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
  console.log("PASS — all four features live");
}

main().catch((e) => { console.error(e); process.exit(1); });
