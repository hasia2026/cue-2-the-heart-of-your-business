// Shared in-process rate limiter for public API routes and auth server
// actions. On Vercel each serverless instance has its own memory, so this is
// per-instance limiting — it blunts abuse and stops a runaway client, but it
// is not a global quota. Keep windows generous enough that one person using
// the app normally (and scripts/e2e.mjs, which fires several calls per run)
// never trips them.
import { headers } from "next/headers";

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

// Cap memory: buckets are tiny and expire, but a key-flooding attacker would
// otherwise grow the map indefinitely. A 1-second cleanup interval is cheap.
const MAX_BUCKETS = 10_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 1000) return;
  lastSweep = now;
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (b.reset < now) buckets.delete(k);
  }
}

/** Returns true when the call is allowed, false when it should be rejected. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= limit;
}

/** Reject helper that also resets an exhausted bucket's context cleanly. */
export function rateLimitResult(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSecs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (b && b.reset >= now && b.n > limit) {
    return { ok: false, retryAfterSecs: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  return { ok: allow(key, limit, windowMs), retryAfterSecs: 0 };
}

/** Best-effort client IP for limiting. Behind Vercel/Next the real client
 *  address arrives in x-forwarded-for (first hop); anything else (local dev,
 *  direct calls) collapses to one bucket — never used for auth decisions. */
function rawIp(headerBag?: Headers): string {
  const ip =
    headerBag?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerBag?.get("x-real-ip")?.trim() ||
    "local";
  return ip;
}

export function clientKey(req: Request, scope: string): string {
  return `${scope}:${rawIp(req.headers)}`;
}

/** Server-action variant — reads the request headers straight from Next's
 *  async request store. Only matters for anonymous auth flows (sign in/up,
 *  password reset) that receive FormData, not a Request object. */
export async function actionKey(scope: string): Promise<string> {
  const h = await headers();
  return `${scope}:${rawIp(h)}`;
}
