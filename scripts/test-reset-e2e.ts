/**
 * End-to-end reset-password flow over live HTTP (console mail mode):
 * request → dev link → set new password → signed in → old token dead.
 * Self-cleaning. Dev server must be up: npx tsx scripts/test-reset-e2e.ts
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

const BASE = "http://localhost:3210";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const email = `reset-e2e-${Date.now()}@test.dev`;
  const user = await prisma.user.create({
    data: { email, name: "Reset Tester", passwordHash: hashPassword("old-password-1") },
  });

  // 1. Request reset (no membership — orgId fallback is userId, fine for audit)
  const reqRes = await fetch(`${BASE}/signin/forgot`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email }),
    redirect: "manual",
  });
  assert(reqRes.status === 303, `forgot form POST redirects (${reqRes.status})`);
  // In console+dev mode the page renders the dev link on the FOLLOW-up GET;
  // the 303 goes to /signin/forgot?sent=1&devlink=… — follow it manually:
  const loc = reqRes.headers.get("location") ?? "";
  assert(loc.includes("sent=1"), "redirects to confirmation");
  const devlink = decodeURIComponent(loc.split("devlink=")[1] ?? "");
  assert(devlink.includes("/signin/reset?token="), "dev link issued (console mode, non-production)");

  // 2. Consume the link: set a new password
  const token = new URL(devlink, BASE).searchParams.get("token")!;
  const resetRes = await fetch(`${BASE}/signin/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, password: "brand-new-pw-9", confirm: "brand-new-pw-9" }),
    redirect: "manual",
  });
  const resetLoc = resetRes.headers.get("location") ?? "";
  assert(resetLoc.includes("/dashboard"), `reset succeeds and signs in (${resetLoc || resetRes.status})`);

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  assert(updated?.passwordChangedAt != null, "passwordChangedAt stamped");
  assert(updated!.passwordHash !== user.passwordHash, "password hash changed");

  // 3. The old token is now dead (single-use) — reusing it lands on error=used
  const reuse = await fetch(`${BASE}/signin/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, password: "another-pw-123", confirm: "another-pw-123" }),
    redirect: "manual",
  });
  assert((reuse.headers.get("location") ?? "").includes("error=used"), "token reuse rejected (single-use)");

  // Cleanup
  await prisma.auditEvent.deleteMany({ where: { OR: [{ organizationId: user.id }, { targetId: user.id }] } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("PASS — full reset-password flow verified over live HTTP, self-cleaned");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
