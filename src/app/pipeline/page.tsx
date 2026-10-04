import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import AppShell from "@/components/AppShell";
import { responseState, RESPONSE_TARGET_MIN } from "@/lib/crm";
import PipelineClient from "./PipelineClient";

export default async function PipelinePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [leads, deals, customers] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId: orgId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: { assignedTo: { select: { name: true } }, customer: { select: { id: true, name: true } } },
    }),
    prisma.deal.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, name: true } },
        vehicle: { select: { year: true, make: true, model: true, stockNumber: true } },
      },
    }),
    prisma.customer.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { deals: true, serviceOrders: true, invoices: true, communications: true } } },
    }),
  ]);

  return (
    <AppShell crumb="Pipeline">
      <PipelineClient
        locale={await getLocale()}
        leads={leads.map((l) => {
          const state = responseState(l.createdAt, l.lastContactAt);
          return {
            id: l.id,
            name: l.name,
            source: l.source,
            interest: l.interest,
            estValue: l.estValue,
            status: l.status,
            assignee: l.assignedTo?.name ?? null,
            customerId: l.customerId,
            customerName: l.customer?.name ?? null,
            createdAt: l.createdAt.toISOString(),
            lastContactAt: l.lastContactAt?.toISOString() ?? null,
            responseState: state,
            minutesWaiting: l.lastContactAt ? null : Math.round((Date.now() - l.createdAt.getTime()) / 60_000),
          };
        })}
        deals={deals.map((dl) => ({
          id: dl.id,
          customer: dl.customer.name,
          customerId: dl.customerId,
          vehicle: dl.vehicle ? `${dl.vehicle.year} ${dl.vehicle.make} ${dl.vehicle.model} (${dl.vehicle.stockNumber})` : null,
          dealType: dl.dealType,
          status: dl.status,
          amount: dl.amount,
          createdAt: dl.createdAt.toISOString(),
          closedAt: dl.closedAt?.toISOString() ?? null,
        }))}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          type: c.type,
          servicePlan: c.servicePlan,
          dealCount: c._count.deals,
          serviceOrderCount: c._count.serviceOrders,
          invoiceCount: c._count.invoices,
          commCount: c._count.communications,
        }))}
        responseTargetMin={RESPONSE_TARGET_MIN}
      />
    </AppShell>
  );
}
