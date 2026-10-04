import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import MessagesClient from "./MessagesClient";

export default async function MessagesPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [threads, employees] = await Promise.all([
    prisma.messageThread.findMany({
      where: { organizationId: orgId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        participants: { include: { employee: { select: { id: true, name: true, title: true } } } },
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    }),
    prisma.employee.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, title: true, department: { select: { name: true } } },
    }),
  ]);

  return (
    <AppShell crumb="Messages">
      <MessagesClient
        meName={session.user.name}
        threads={threads.map((t) => ({
          id: t.id,
          title: t.title,
          isGroup: t.isGroup,
          lastMessageAt: t.lastMessageAt.toISOString(),
          participants: t.participants.map((p) => ({ id: p.employee.id, name: p.employee.name, title: p.employee.title })),
          messages: t.messages.map((m) => ({
            id: m.id,
            authorName: m.authorName,
            authorEmployeeId: m.authorEmployeeId,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          })),
        }))}
        employees={employees.map((e) => ({ id: e.id, name: e.name, title: e.title, department: e.department?.name ?? null }))}
      />
    </AppShell>
  );
}
