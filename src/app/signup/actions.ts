"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const SignUpSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(100),
});

export async function signUp(formData: FormData) {
  const parsed = SignUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/signup?error=" + encodeURIComponent("Please fill every field (password must be at least 8 characters)."));
  }
  const { name, email, password } = parsed.data;

  // Workspace-creation flood guard: 3 signups/min per IP.
  const ip = clientIp(await (await import("next/headers")).headers());
  if (!rateLimit(`signup:ip:${ip}`, 3, 60).ok) {
    redirect("/signup?error=" + encodeURIComponent("Too many attempts — wait a minute and try again."));
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/signup?error=" + encodeURIComponent("An account with that email already exists. Try signing in."));
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash: hashPassword(password) },
  });

  const org = await prisma.organization.create({
    data: { name: name.includes(" ") ? `${name.split(" ")[0]}'s Company` : `${name}'s Company`, isDemo: false },
  });

  await prisma.member.create({
    data: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });

  await prisma.businessProfile.create({
    data: { organizationId: org.id, name: org.name, onboardingStep: 2 },
  });

  await prisma.aiSettings.create({
    data: { organizationId: org.id },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  await logAudit({
    organizationId: org.id,
    actorType: "USER",
    actorId: user.id,
    action: "ACCOUNT_CREATED",
    detail: `${name} created a new CUE workspace`,
  });

  redirect("/onboarding");
}
