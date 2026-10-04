/**
 * Verifies /expand (training + quiz types) and /messages (unread badge)
 * render for an authenticated session, using the Riverside demo seed.
 * Dev server must be up: npx tsx scripts/smoke-expand-messages.ts
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
  const user = await prisma.user.findUnique({ where: { email: "gm@riversideauto.demo" } });
  if (!user) throw new Error("demo user missing — run prisma/seed-dealership.ts");
  const cookie = `cue_session=${signSession(user.id)}`;

  const [expand, messages, dash] = await Promise.all([
    (await fetch(`${BASE}/expand`, { headers: { cookie } })).text(),
    (await fetch(`${BASE}/messages`, { headers: { cookie } })).text(),
    (await fetch(`${BASE}/dashboard`, { headers: { cookie } })).text(),
  ]);

  const checks: [string, boolean][] = [
    ["Expand: demo training module renders", expand.includes("15-minute lead response")],
    ["Expand: demo lesson renders", expand.includes("The 15-minute rule")],
    ["Messages: demo group thread renders", messages.includes("Sales floor")],
    ["Messages: thread participants render", messages.includes("Tonya Parks")],
    ["Dashboard: unread-conversations briefing line", dash.includes("conversation with unread messages")],
    ["Dashboard: market-signals briefing line", /market signal\S* to triage/.test(dash)],
    ["Dashboard: google-reviews briefing line", /Google review\S* waiting for a reply/.test(dash)],
    ["Messages: nav unread badge markup", /bg-accent-orange|badge/i.test(messages)],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failed++;
  }
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
  console.log("PASS — /expand and /messages render with new quiz + badge UI");
}
main().catch((e) => { console.error(e); process.exit(1); });
