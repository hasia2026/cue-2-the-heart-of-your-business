import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────
// Unread messaging counts, shared by the Morning Briefing and
// the nav badge. A thread is unread when its latest message is
// not mine and arrived after my lastReadAt.
// ─────────────────────────────────────────────────────────────

/** Count threads with unread messages for the org's acting employee. */
export async function countUnreadThreads(orgId: string): Promise<number> {
  const emp = await prisma.employee.findFirst({ where: { organizationId: orgId } });
  if (!emp) return 0;
  const parts = await prisma.threadParticipant.findMany({
    where: { employeeId: emp.id },
    include: { thread: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  let n = 0;
  for (const p of parts) {
    const last = p.thread.messages[0];
    if (!last || last.authorEmployeeId === emp.id) continue;
    if (p.lastReadAt && last.createdAt <= p.lastReadAt) continue;
    n++;
  }
  return n;
}
