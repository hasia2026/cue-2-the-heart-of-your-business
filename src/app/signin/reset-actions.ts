"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { createResetToken, verifyResetToken, tokenIsCurrent } from "@/lib/reset-token";
import { sendMail, mailMode } from "@/lib/mailer";
import { rateLimit, clientIp } from "@/lib/ratelimit";

function appUrl(): string {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3210";
}

/** Ask for a reset link. Always behaves identically whether or not the
 *  account exists (no account enumeration), and is rate-limited. */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const headers = await (await import("next/headers")).headers();
  if (!rateLimit(`reset:req:${clientIp(headers)}`, 5, 300).ok) {
    redirect("/signin/forgot?sent=1"); // identical response under flood
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user) {
    const token = createResetToken(user.id);
    const link = `${appUrl()}/signin/reset?token=${encodeURIComponent(token)}`;
    const result = await sendMail({
      to: email,
      subject: "Reset your CUE password",
      heading: "Reset your password",
      text: `Hi ${user.name},\n\nUse this link to choose a new password. It expires in 30 minutes and can be used once:\n\n${link}\n\nIf you didn't ask for this, you can ignore the email — your password is unchanged.`,
    });
    await logAudit({
      organizationId: (await prisma.member.findFirst({ where: { userId: user.id } }))?.organizationId ?? user.id,
      actorType: "SYSTEM",
      action: "PASSWORD_RESET_REQUESTED",
      targetType: "User",
      targetId: user.id,
      detail: `Reset email sent to ${email} (${result.mode} mode)`,
    });
    // In CONSOLE mode the link only exists in logs; also surface it in
    // the UI in non-production so the flow is testable without a provider.
    if (result.mode === "CONSOLE" && process.env.NODE_ENV !== "production") {
      redirect(`/signin/forgot?sent=1&devlink=${encodeURIComponent(link)}`);
    }
  }

  redirect("/signin/forgot?sent=1");
}

/** Consume the token and set the new password. */
export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const userId = verifyResetToken(token);
  if (!userId) redirect("/signin/reset?error=invalid");

  if (password.length < 8) redirect(`/signin/reset?token=${encodeURIComponent(token)}&error=short`);
  if (password !== confirm) redirect(`/signin/reset?token=${encodeURIComponent(token)}&error=mismatch`);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/signin/reset?error=invalid");
  if (!tokenIsCurrent(token, user.passwordChangedAt)) redirect("/signin/reset?error=used");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password), passwordChangedAt: new Date() },
  });
  await logAudit({
    organizationId: (await prisma.member.findFirst({ where: { userId: user.id } }))?.organizationId ?? user.id,
    actorType: "USER",
    actorId: user.id,
    action: "PASSWORD_RESET_COMPLETED",
    targetType: "User",
    targetId: user.id,
    detail: `${user.email} set a new password`,
  });

  // Sign them in — the token is single-use because passwordChangedAt
  // is now newer than the token's issue time.
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/dashboard");
}

/** Change password from Settings (requires current password). */
export async function changePassword(_prev: unknown, formData: FormData) {
  const { requireSessionAction } = await import("@/lib/auth");
  const session = await requireSessionAction();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !verifyPassword(current, user.passwordHash)) {
    return { error: "Current password didn't match." };
  }
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords didn't match." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next), passwordChangedAt: new Date() },
  });
  await logAudit({
    organizationId: session.organizationId,
    actorId: user.id,
    action: "PASSWORD_CHANGED",
    targetType: "User",
    targetId: user.id,
    detail: `${user.email} changed their password`,
  });
  return { ok: true };
}

export async function mailStatus() {
  return { mode: mailMode() };
}
