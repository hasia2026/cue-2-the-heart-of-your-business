import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import UnscheduledBoard, { type Job } from "../UnscheduledBoard";

export const dynamic = "force-dynamic";

/**
 * Unscheduled maintenance board — open service-plan jobs grouped by
 * town/area, with a monthly report and CSV/Google-Maps export. This is the
 * exact gap HCP owners describe: generated maintenance jobs pile up in an
 * unscheduled queue with no map, no monthly report, and no area grouping.
 */
export default async function UnscheduledPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await sql`
    select so.id, c.name as customer, c.address, c.area, c.phone,
           so.title, so.status, so.amount, so.opened_at,
           -- one live maintenance agreement per customer (unique partial index)
           ma.plan_name as agreement
    from service_orders so
    join customers c on c.id = so.customer_id
    left join maintenance_agreements ma
      on ma.customer_id = c.id and ma.organization_id = ${orgId} and ma.status = 'ACTIVE'
    where so.organization_id = ${orgId}
      and so.status in ('OPEN', 'SCHEDULED')  -- not COMPLETED / IN_PROGRESS / AWAITING_PARTS
      and not exists (
        select 1 from appointments a
        where a.organization_id = ${orgId} and a.customer_id = so.customer_id
          and a.status in ('SCHEDULED')
      )
    order by c.area nulls last, so.opened_at asc`;

  const jobs: Job[] = rows.map((r) => ({
    id: r.id,
    customer: r.customer,
    address: r.address ?? null,
    area: r.area ?? null,
    title: r.title,
    amount: Number(r.amount ?? 0),
    openedDays: Math.max(0, Math.floor((Date.now() - new Date(r.opened_at).getTime()) / 864e5)),
    status: r.status,
    agreement: r.agreement ?? null,
    phone: r.phone ?? null,
  }));

  const agreements = await sql`
    select count(*)::int as n from maintenance_agreements
    where organization_id = ${orgId} and status = 'ACTIVE'`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="page-title">Unscheduled board</h1>
        <p className="page-sub">Open maintenance work by area, ready to route.</p>
      </div>
      <UnscheduledBoard
        jobs={jobs}
        hasAgreements={Number(agreements[0]?.n ?? 0) > 0}
        labels={{}} // English fallbacks live in the component
      />
    </div>
  );
}
