import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { hashPassword } from "./password";

// ─────────────────────────────────────────────────────────────
// Team management. One user can belong to several organizations
// (Member rows); the active one is the cue_org cookie, verified
// against membership on every request (src/lib/auth.ts).
// Roles: OWNER > MANAGER > MEMBER (staff). OWNER is protected:
// at least one must remain, and only OWNERs manage the team.
// ─────────────────────────────────────────────────────────────

export type TeamRole = "OWNER" | "MANAGER" | "MEMBER";

export const ROLE_RANK: Record<string, number> = { OWNER: 3, MANAGER: 2, MEMBER: 1 };

export async function listMembers(orgId: string) {
  return prisma.member.findMany({
    where: { organizationId: orgId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { name: true, email: true, createdAt: true } } },
  });
}

export function canManageTeam(role: string): boolean {
  return role === "OWNER";
}

export type InviteResult = {
  email: string;
  role: TeamRole;
  tempPassword: string;
  invitedName: string;
};

/** Invite (or re-invite) a teammate by email: creates the user with a
 *  temporary password and joins them to the org with the given role. */
export async function inviteTeammate(
  orgId: string,
  orgName: string,
  input: { email: string; name: string; role: TeamRole },
  actorId: string
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  const role: TeamRole = ["OWNER", "MANAGER", "MEMBER"].includes(input.role) ? input.role : "MEMBER";

  const tempPassword = randomBytes(9).toString("base64url").slice(0, 12) + "7A";
  const existing = await prisma.user.findUnique({ where: { email } });

  let userId: string;
  let invitedName: string;
  if (existing) {
    userId = existing.id;
    invitedName = existing.name;
    const membership = await prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
    });
    if (membership) throw new Error("That person is already on this team");
  } else {
    const user = await prisma.user.create({
      data: { email, name: input.name.trim().slice(0, 80) || email.split("@")[0], passwordHash: hashPassword(tempPassword) },
    });
    userId = user.id;
    invitedName = user.name;
  }

  await prisma.member.create({ data: { organizationId: orgId, userId, role } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "TEAM_INVITED",
    targetType: "Member",
    targetId: userId,
    detail: `${invitedName} (${email}) invited as ${role}`,
    metadata: { email, role },
  });
  return { email, role, tempPassword, invitedName };
}

export async function changeMemberRole(orgId: string, memberId: string, newRole: TeamRole, actorId: string) {
  if (!["OWNER", "MANAGER", "MEMBER"].includes(newRole)) throw new Error("Invalid role");
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!member) throw new Error("Member not found");

  const owners = await prisma.member.count({ where: { organizationId: orgId, role: "OWNER" } });
  if (member.role === "OWNER" && newRole !== "OWNER" && owners <= 1) {
    throw new Error("Promote another owner first — a workspace needs at least one owner");
  }

  await prisma.member.update({ where: { id: member.id }, data: { role: newRole } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "TEAM_ROLE_CHANGED",
    targetType: "Member",
    targetId: member.id,
    detail: `${member.user.name}: ${member.role} → ${newRole}`,
  });
}

export async function removeMember(orgId: string, memberId: string, actorId: string) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!member) throw new Error("Member not found");

  const owners = await prisma.member.count({ where: { organizationId: orgId, role: "OWNER" } });
  if (member.role === "OWNER" && owners <= 1) {
    throw new Error("You cannot leave a workspace without an owner — promote someone first");
  }

  await prisma.member.delete({ where: { id: member.id } });
  await logAudit({
    organizationId: orgId,
    actorId,
    action: "TEAM_REMOVED",
    targetType: "Member",
    targetId: member.id,
    detail: `${member.user.name} (${member.user.email}) removed from the workspace`,
  });
}

/** Which orgs can this user switch into? */
export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { name: true } } },
  });
  return memberships.map((m) => ({ organizationId: m.organizationId, name: m.organization.name, role: m.role }));
}
