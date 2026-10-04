import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, ORG_COOKIE, verifySession } from "./session";

export type SessionContext = {
  user: { id: string; name: string; email: string };
  organizationId: string;
  organizationName: string;
  role: string;
};

/** Returns the signed-in user's session context, or null. The active
 *  organization is the cue_org cookie when the user is a member of it
 *  (workspace switching), otherwise their first membership. */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  const userId = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { user: true, organization: true },
  });
  if (memberships.length === 0) return null;

  const requested = jar.get(ORG_COOKIE)?.value;
  const membership =
    (requested ? memberships.find((m) => m.organizationId === requested) : undefined) ??
    memberships[0];

  return {
    user: {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
    },
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}

/** For pages: redirects to /signin when there is no session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session;
}

/** For server actions: throws when there is no session. */
export async function requireSessionAction(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}
