import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale";
import AppShell from "@/components/AppShell";
import Customer360Client from "./Customer360Client";

export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const orgId = session.organizationId;

  const customer = await prisma.customer.findFirst({ where: { id, organizationId: orgId } });
  if (!customer) notFound();

  const [vehicles, orders, invoices, comms, deals] = await Promise.all([
    prisma.vehicle.findMany({
      where: { organizationId: orgId, serviceOrders: { some: { customerId: customer.id } } },
      distinct: ["id"],
      take: 12,
    }),
    prisma.serviceOrder.findMany({
      where: { organizationId: orgId, customerId: customer.id },
      orderBy: { openedAt: "desc" },
      take: 20,
    }),
    prisma.invoice.findMany({
      where: { organizationId: orgId, customerId: customer.id },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    prisma.communication.findMany({
      where: { organizationId: orgId, customerId: customer.id },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    prisma.deal.findMany({
      where: { organizationId: orgId, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      include: { vehicle: { select: { year: true, make: true, model: true } } },
    }),
  ]);

  const linkedLead = await prisma.lead.findFirst({
    where: { organizationId: orgId, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return (
    <AppShell crumb={`Customer — ${customer.name}`}>
      <Customer360Client
        locale={await getLocale()}
        customer={{
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          type: customer.type,
          servicePlan: customer.servicePlan,
          address: customer.address,
          createdAt: customer.createdAt.toISOString(),
        }}
        vehicles={vehicles.map((v) => ({
          id: v.id, year: v.year, make: v.make, model: v.model, trim: v.trim,
          stockNumber: v.stockNumber, status: v.status,
        }))}
        orders={orders.map((o) => ({
          id: o.id, title: o.title, status: o.status, amount: o.amount,
          openedAt: o.openedAt.toISOString(), completedAt: o.completedAt?.toISOString() ?? null,
        }))}
        invoices={invoices.map((i) => ({
          id: i.id, number: i.number, amount: i.amount, status: i.status,
          issuedAt: i.issuedAt?.toISOString() ?? null, paidAt: i.paidAt?.toISOString() ?? null,
        }))}
        comms={comms.map((c) => ({
          id: c.id, channel: c.channel, direction: c.direction, summary: c.summary, occurredAt: c.occurredAt.toISOString(),
        }))}
        deals={deals.map((d) => ({
          id: d.id, status: d.status, amount: d.amount,
          vehicle: d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : null,
          createdAt: d.createdAt.toISOString(),
        }))}
        leadId={linkedLead?.id ?? null}
      />
    </AppShell>
  );
}
