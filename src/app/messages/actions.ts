"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// Messaging. Direct (1:1) and group threads scoped to the org.
// The signed-in user is mapped to their Employee record when one
// exists (owner without an employee row can still message; the
// author name is snapshotted per message).
// ─────────────────────────────────────────────────────────────

async function currentEmployee() {
  const session = await requireSessionAction();
  const emp = await prisma.employee.findFirst({ where: { organizationId: session.organizationId } });
  return { session, emp };
}

export async function startDirectThread(otherEmployeeId: string) {
  const { session, emp } = await currentEmployee();

  const other = await prisma.employee.findFirst({
    where: { id: otherEmployeeId, organizationId: session.organizationId },
  });
  if (!other) throw new Error("Employee not found");

  // Reuse an existing direct thread between the two if it exists
  const mine = await prisma.threadParticipant.findMany({
    where: { employeeId: emp?.id ?? "__none__" },
    select: { threadId: true },
  });
  for (const p of mine) {
    const participants = await prisma.threadParticipant.findMany({
      where: { threadId: p.threadId },
      include: { employee: { select: { id: true } } },
    });
    if (
      participants.length === 2 &&
      participants.some((x) => x.employee.id === otherEmployeeId)
    ) {
      return { ok: true, threadId: p.threadId };
    }
  }

  const thread = await prisma.messageThread.create({
    data: {
      organizationId: session.organizationId,
      isGroup: false,
      participants: {
        create: [
          ...(emp ? [{ employeeId: emp.id }] : []),
          { employeeId: other.id },
        ],
      },
    },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "THREAD_STARTED",
    targetType: "MessageThread",
    targetId: thread.id,
    detail: `Direct thread with ${other.name}`,
  });

  revalidatePath("/messages");
  return { ok: true, threadId: thread.id };
}

export async function startGroupThread(title: string, employeeIds: string[]) {
  const { session, emp } = await currentEmployee();
  if (!title.trim() || employeeIds.length === 0) throw new Error("Title and at least one member required");

  const valid = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, organizationId: session.organizationId },
  });

  const thread = await prisma.messageThread.create({
    data: {
      organizationId: session.organizationId,
      title: title.trim(),
      isGroup: true,
      participants: {
        create: [
          ...(emp ? [{ employeeId: emp.id }] : []),
          ...valid.map((v) => ({ employeeId: v.id })),
        ],
      },
    },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "THREAD_STARTED",
    targetType: "MessageThread",
    targetId: thread.id,
    detail: `Group "${title.trim()}" with ${valid.length} member(s)`,
  });

  revalidatePath("/messages");
  return { ok: true, threadId: thread.id };
}

export async function sendMessage(threadId: string, body: string) {
  const { session, emp } = await currentEmployee();
  const text = body.trim();
  if (!text) throw new Error("Message is empty");

  const thread = await prisma.messageThread.findFirst({
    where: { id: threadId, organizationId: session.organizationId },
  });
  if (!thread) throw new Error("Thread not found");

  const msg = await prisma.message.create({
    data: {
      threadId,
      authorEmployeeId: emp?.id ?? null,
      authorName: emp?.name ?? session.user.name,
      body: text.slice(0, 4000),
    },
  });

  await prisma.messageThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });
  if (emp) {
    await prisma.threadParticipant.updateMany({
      where: { threadId, employeeId: emp.id },
      data: { lastReadAt: new Date() },
    });
  }

  revalidatePath("/messages");
  return { ok: true, messageId: msg.id };
}

export async function markThreadRead(threadId: string) {
  const { session, emp } = await currentEmployee();
  if (!emp) return { ok: false };
  await prisma.threadParticipant.updateMany({
    where: { threadId, employeeId: emp.id },
    data: { lastReadAt: new Date() },
  });
  revalidatePath("/messages");
  return { ok: true };
}
