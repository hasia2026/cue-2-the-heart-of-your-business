import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale";
import AppShell from "@/components/AppShell";
import { responseState, RESPONSE_TARGET_MIN } from "@/lib/crm";
import LeadDetailClient from "./LeadDetailClient";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const orgId = session.organizationId;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId },
    include: {
      assignedTo: { select: { id: true, name: true, title: true } },
      customer: { select: { id: true, name: true } },
    },
  });
  if (!lead) notFound();

  // Communications + deals only exist once a customer record is linked.
  const comms = lead.customerId
    ? await prisma.communication.findMany({
        where: { organizationId: orgId, customerId: lead.customerId },
        orderBy: { occurredAt: "desc" },
        take: 20,
      })
    : [];
  const deals = lead.customerId
    ? await prisma.deal.findMany({
        where: { organizationId: orgId, customerId: lead.customerId },
        orderBy: { createdAt: "desc" },
        include: { vehicle: { select: { year: true, make: true, model: true } } },
      })
    : [];
  const originSignal = await prisma.marketSignal.findFirst({
    where: { organizationId: orgId, convertedLeadId: lead.id },
    select: { id: true, title: true, source: true, externalUrl: true, author: true, content: true, receivedAt: true },
  });

  return (
    <AppShell crumb={`Lead — ${lead.name}`}>
      <LeadDetailClient
        locale={await getLocale()}
        lead={{
          id: lead.id,
          name: lead.name,
          source: lead.source,
          interest: lead.interest,
          estValue: lead.estValue,
          status: lead.status,
          assignee: lead.assignedTo ? { id: lead.assignedTo.id, name: lead.assignedTo.name, title: lead.assignedTo.title } : null,
          customerId: lead.customerId,
          customerName: lead.customer?.name ?? null,
          createdAt: lead.createdAt.toISOString(),
          lastContactAt: lead.lastContactAt?.toISOString() ?? null,
          responseState: responseState(lead.createdAt, lead.lastContactAt),
          minutesWaiting: lead.lastContactAt ? null : Math.round((Date.now() - lead.createdAt.getTime()) / 60_000),
        }}
        comms={comms.map((c) => ({
          id: c.id, channel: c.channel, direction: c.direction, summary: c.summary, occurredAt: c.occurredAt.toISOString(),
        }))}
        deals={deals.map((d) => ({
          id: d.id, status: d.status, amount: d.amount,
          vehicle: d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : null,
          createdAt: d.createdAt.toISOString(),
        }))}
        originSignal={originSignal
          ? { id: originSignal.id, title: originSignal.title, source: originSignal.source, externalUrl: originSignal.externalUrl, author: originSignal.author, content: originSignal.content, receivedAt: originSignal.receivedAt.toISOString() }
          : null}
        responseTargetMin={RESPONSE_TARGET_MIN}
      />
    </AppShell>
  );
}
