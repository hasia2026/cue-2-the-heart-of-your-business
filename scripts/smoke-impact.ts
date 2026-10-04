/**
 * Verifies the new Money-on-the-Table hero and Impact Receipts render
 * for an authenticated session, by minting a valid session cookie the
 * same way the app does. Run with the dev server up.
 */
import { createHmac } from "crypto";
import { prisma } from "../src/lib/prisma";

const BASE = "http://localhost:3210";

function signSession(userId: string): string {
  const secret = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
  const expires = Date.now() + 1000 * 60 * 60 * 24;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "owner@summithome.demo" } });
  if (!user) throw new Error("demo user not found");
  const cookie = `cue_session=${signSession(user.id)}`;

  const dash = await fetch(`${BASE}/dashboard`, { headers: { cookie }, redirect: "follow" });
  const dashHtml = await dash.text();
  const hasHero = dashHtml.includes("Money on the table");
  const moneyMatch = dashHtml.match(/\$[\d,]+/g)?.slice(0, 4) ?? [];
  console.log(`dashboard ${dash.status} — hero: ${hasHero ? "✓" : "✗"} figures: ${moneyMatch.join(" ")}`);

  const ex = await fetch(`${BASE}/execute`, { headers: { cookie }, redirect: "follow" });
  const exHtml = await ex.text();
  const hasReceipts = exHtml.includes("Impact receipts");
  console.log(`execute ${ex.status} — receipts tab: ${hasReceipts ? "✓" : "✗"}`);

  await prisma.$disconnect();
  if (!hasHero || !hasReceipts) process.exit(1);
  console.log("PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
