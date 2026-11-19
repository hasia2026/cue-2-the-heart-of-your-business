import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Scal3Page() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const [scal] = await sql`
    select
      (select coalesce(sum(amount),0) from invoices where organization_id = ${orgId} and status='PAID')::float as collected,
      (select coalesce(sum(amount),0) from invoices where organization_id = ${orgId} and status='OVERDUE')::float as overdue,
      (select coalesce(sum(est_value),0) from leads where organization_id = ${orgId} and status in ('NEW','CONTACTED','QUALIFIED'))::float as pipeline,
      (select coalesce(sum(i.amount),0) from invoices i join service_orders s on s.id = i.service_order_id
        where i.organization_id = ${orgId} and i.status='PAID' and s.invoiced_at is not null
        and s.completed_at is not null and i.issued_at - s.completed_at > interval '48 hours')::float as recovered_late
  `;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/expand" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Expand</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="page-title">Scal³</h1>
          <span className="badge-purple">Revenue Intelligence</span>
        </div>
        <p className="page-sub">Money in motion — computed from your records, not a separate spreadsheet.</p>
      </div>

      <section className="card p-5">
        <div className="flex items-center gap-2">
          <h2 className="bg-gradient-to-r from-cue-blue via-cue-purple to-cue-orange bg-clip-text text-lg font-bold text-transparent">Scal³</h2>
          <span className="muted ms-auto text-xs">Live snapshot</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="text-xs uppercase tracking-widest text-navy-300">Collected</div>
            <div className="kpi mt-1 text-emerald-300">${Math.round(scal?.collected ?? 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="text-xs uppercase tracking-widest text-navy-300">Pipeline (open leads)</div>
            <div className="kpi mt-1">${Math.round(scal?.pipeline ?? 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="text-xs uppercase tracking-widest text-navy-300">Overdue</div>
            <div className="kpi mt-1 text-cue-orange">${Math.round(scal?.overdue ?? 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="text-xs uppercase tracking-widest text-navy-300">Billed late (fixable)</div>
            <div className="kpi mt-1 text-cue-blue">${Math.round(scal?.recovered_late ?? 0).toLocaleString()}</div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="section-title mb-2">What this page tracks</h2>
        <p className="muted text-sm">
          Collected is paid invoice value. Pipeline is the estimated value of open leads. Overdue is unpaid invoice value past due.
          Billed late surfaces paid work that was invoiced more than 48 hours after completion, so you can tighten the handoff.
        </p>
      </section>
    </div>
  );
}
