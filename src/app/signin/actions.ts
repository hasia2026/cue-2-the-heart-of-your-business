"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Brute-force protection: 10 attempts/min per IP, 5 per targeted account.
  const ip = clientIp(await (await import("next/headers")).headers());
  if (!rateLimit(`signin:ip:${ip}`, 10, 60).ok) redirect("/signin?error=slow");
  if (email) {
    const acct = rateLimit(`signin:acct:${email}`, 5, 300);
    if (!acct.ok) redirect(`/signin?error=slow&retry=${acct.retryAfterSec}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/signin?error=invalid");
  }

  const membership = await prisma.member.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) redirect("/signin?error=org");

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  await logAudit({
    organizationId: membership.organizationId,
    actorType: "USER",
    actorId: user.id,
    action: "USER_SIGNED_IN",
    detail: `${user.name} signed in`,
  });

  redirect("/dashboard");
}
