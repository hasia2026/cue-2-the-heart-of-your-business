"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { ORG_COOKIE } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { inviteTeammate, changeMemberRole, removeMember, canManageTeam, type TeamRole } from "@/lib/team";
import { sendMail, mailMode } from "@/lib/mailer";
import { createResetToken } from "@/lib/reset-token";

export async function inviteTeammateAction(formData: FormData) {
  const session = await requireSessionAction();
  if (!canManageTeam(session.role)) throw new Error("Only owners can manage the team");

  const result = await inviteTeammate(
    session.organizationId,
    session.organizationName,
    {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? "MEMBER") as TeamRole,
    },
    session.user.id
  );

  // Email the credentials: a reset link when mail is configured (they
  // set their own password), the temp password otherwise.
  const appBase = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3210";
  let emailed = false;
  if (mailMode() === "RESEND") {
    const token = createResetToken((await prisma.user.findUnique({ where: { email: result.email }, select: { id: true } }))!.id);
    const mail = await sendMail({
      to: result.email,
      subject: `You've been added to ${session.organizationName} on CUE`,
      heading: `Welcome to ${session.organizationName}`,
      text: `Hi ${result.invitedName},\n\n${session.user.name} added you to the ${session.organizationName} workspace on CUE as ${result.role.toLowerCase()}.\n\nSet your password here (link expires in 30 minutes):\n${appBase}/signin/reset?token=${encodeURIComponent(token)}\n\nIf the link expires, use "Forgot password" on the sign-in page with this email.`,
    });
    emailed = mail.delivered;
  }

  revalidatePath("/settings");
  return { ok: true, emailed, ...result };
}

export async function changeRoleAction(memberId: string, role: string) {
  const session = await requireSessionAction();
  if (!canManageTeam(session.role)) throw new Error("Only owners can manage the team");
  await changeMemberRole(session.organizationId, memberId, role as TeamRole, session.user.id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function removeMemberAction(memberId: string) {
  const session = await requireSessionAction();
  if (!canManageTeam(session.role)) throw new Error("Only owners can manage the team");
  await removeMember(session.organizationId, memberId, session.user.id);
  revalidatePath("/settings");
  return { ok: true };
}

/** Switch the active workspace (must be a member). */
export async function switchOrganizationAction(organizationId: string) {
  const session = await requireSessionAction();
  const membership = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    include: { organization: { select: { name: true } } },
  });
  if (!membership) throw new Error("You are not a member of that workspace");

  const jar = await cookies();
  jar.set(ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true, organizationName: membership.organization.name };
}
