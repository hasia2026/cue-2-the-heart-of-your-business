import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.CUE_SESSION_SECRET ?? process.env.BIZMO_SESSION_SECRET ?? "dev-only-secret-change-me";
export const SESSION_COOKIE = "cue_session";
/** Active-workspace cookie (verified against membership in auth.ts). */
export const ORG_COOKIE = "cue_org";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function signSession(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const expected = createHmac("sha256", SECRET)
    .update(`${userId}.${expires}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}
