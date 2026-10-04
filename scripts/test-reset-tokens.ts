/**
 * DB-free verification of reset-token semantics.
 * npx tsx scripts/test-reset-tokens.ts
 */
import { createResetToken, verifyResetToken, tokenIsCurrent } from "../src/lib/reset-token";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  const userId = "user-abc123";

  // Round-trip
  const token = createResetToken(userId);
  assert(verifyResetToken(token) === userId, "fresh token verifies and returns the userId");

  // Tamper: flip payload → signature must fail
  const tampered = token.replace(userId, "user-hacker");
  assert(verifyResetToken(tampered) === null, "tampered payload rejected");
  const badSig = `${token.slice(0, -4)}AAAA`;
  assert(verifyResetToken(badSig) === null, "bad signature rejected");
  assert(verifyResetToken("garbage") === null, "garbage rejected");
  assert(verifyResetToken(undefined) === null, "undefined rejected");

  // Expiry: craft a token issued 31 minutes ago (TTL is 30)
  const { createHmac } = await import("crypto");
  const expiredPayload = `${userId}.${Date.now() - 31 * 60_000}.xyz`;
  const expired = `${expiredPayload}.${createHmac("sha256", process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me").update(expiredPayload).digest("base64url")}`;
  assert(verifyResetToken(expired) === null, "expired token rejected");

  // Single-use semantics via passwordChangedAt
  assert(tokenIsCurrent(token, null) === true, "token current when user never changed password");
  const oldChange = new Date(Date.now() - 60_000);
  assert(tokenIsCurrent(token, oldChange) === true, "token issued AFTER last change is current");
  const futureChange = new Date(Date.now() + 60_000);
  assert(tokenIsCurrent(token, futureChange) === false, "token invalidated by a LATER password change (single-use)");

  console.log("PASS — reset-token lifecycle verified (DB-free)");
}
main().catch((e) => { console.error(e); process.exit(1); });
