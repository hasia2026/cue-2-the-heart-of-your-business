// Password hashing + HMAC session cookies — node crypto only, no deps.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "./db";

export const SESSION_COOKIE = "cue_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const secret = () => {
  const s = process.env.CUE_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("CUE_SESSION_SECRET missing or too short (need >=32 chars)");
  return s;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `s1:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [v, salt, hash] = stored.split(":");
  if (v !== "s1" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function makeToken(userId: string): string {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now()) return null;
  return userId;
}

export type Session = { user: { id: string; email: string; name: string }; organizationId: string; role: string };

/** Read + verify the session cookie; returns null when signed out. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = readToken(token);
  if (!userId) return null;
  const rows = await sql`
    select u.id, u.email, u.name, m.organization_id as "organizationId", m.role
    from users u
    join members m on m.user_id = u.id
    where u.id = ${userId}
    order by m.created_at asc
    limit 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { user: { id: r.id, email: r.email, name: r.name }, organizationId: r.organizationId, role: r.role };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated");
  return s;
}

/** Server action variant: throws a friendly error for form surfaces. */
export async function requireSessionAction(): Promise<Session> {
  return requireSession();
}

export async function createSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
