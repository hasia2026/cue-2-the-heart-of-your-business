import { createHmac, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────
// Password-reset tokens, stateless:
//   token = base64url(userId.issuedAtMs.nonce).hmac
// The server needs no reset-table. Expiry = issuedAt + TTL at
// verify time; single-use is enforced by comparing issuedAt with
// the user's passwordChangedAt — any reset (or password change)
// invalidates tokens issued before it. Signed with the session secret.
// ─────────────────────────────────────────────────────────────

const SECRET = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
export const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createResetToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}.${Math.random().toString(36).slice(2, 10)}`;
  return `${payload}.${sign(payload)}`;
}

/** Validate shape + signature + expiry. Returns the userId, or null. */
export function verifyResetToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, issuedAt, nonce, sig] = parts;
  const expected = sign(`${userId}.${issuedAt}.${nonce}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return null;
  if (issued + RESET_TTL_MS < Date.now()) return null;
  return userId;
}

/** True when this token was issued after the user's last password change. */
export function tokenIsCurrent(token: string, passwordChangedAt: Date | null): boolean {
  const issuedAt = Number(token.split(".")[1]);
  if (!Number.isFinite(issuedAt)) return false;
  if (!passwordChangedAt) return true;
  return issuedAt >= passwordChangedAt.getTime();
}
