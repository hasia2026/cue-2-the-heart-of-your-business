import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";

export const dynamic = "force-dynamic";

const money = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type Row = {
  id: string; name: string; email: string | null; phone: string | null;
  type: string; status: string; area: string | null;
  invoice_count: number; paid: string | number; outstanding: string | number;
  deals_won: number; jobs: number; created_at: string;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const { q } = await searchParams;
  const needle = (q ?? "").trim();

  const rows = (needle
    ? await sql`
        select c.id, c.name, c.email, c.phone, c.type, c.status, c.area, c.created_at,
          (select count(*) from invoices i where i.customer_id = c.id and i.status <> 'VOID')::int as invoice_count,
          (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = c.id and i.status = 'PAID') as paid,
          (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = c.id and i.status in ('SENT','OVERDUE')) as outstanding,
          (select count(*) from deals d where d.customer_id = c.id and d.status = 'WON')::int as deals_won,
          (select count(*) from service_orders s where s.customer_id = c.id)::int as jobs
        from customers c
        where c.organization_id = ${orgId}
          and (c.name ilike ${"%" + needle + "%"} or coalesce(c.email, "") ilike ${"%" + needle + "%"} or coalesce(c.phone, "") ilike ${"%" + needle + "%"})
        order by c.created_at desc limit 200`
    : await sql`
        select c.id, c.name, c.email, c.phone, c.type, c.status, c.area, c.created_at,
          (select count(*) from invoices i where i.customer_id = c.id and i.status <> 'VOID')::int as invoice_count,
          (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = c.id and i.status = 'PAID') as paid,
          (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = c.id and i.status in ('SENT','OVERDUE')) as outstanding,
          (select count(*) from deals d where d.customer_id = c.id and d.status = 'WON')::int as deals_won,
          (select count(*) from service_orders s where s.customer_id = c.id)::int as jobs
        from customers c
        where c.organization_id = ${orgId}
        order by c.created_at desc limit 200`) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="me-auto">
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Every customer's full history — invoices, deals, jobs, agreements, communications.</p>
        </div>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={needle}
            placeholder="Search name, email, phone…"
            className="input w-64"
            aria-label="Search customers"
          />
          <button className="btn-ghost">Search</button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/pipeline/customers/${c.id}`}
            className="card p-4 transition hover:border-violet-400/40"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{c.name}</span>
              {c.status === "ACTIVE" ? <span className="badge-green ms-auto">active</span> : <span className="badge-low">{c.status}</span>}
            </div>
            <div className="muted mt-0.5 text-xs">
              {c.type}{c.area ? ` · ${c.area}` : ""}
              {c.email ? ` · ${c.email}` : ""}{c.phone ? ` · ${c.phone}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="badge-purple">{c.invoice_count} invoice{c.invoice_count === 1 ? "" : "s"}</span>
              {Number(c.outstanding) > 0 && <span className="badge-red">{money(c.outstanding)} open</span>}
              <span className="badge-green">{money(c.paid)} paid</span>
              {c.deals_won > 0 && <span className="badge-blue">{c.deals_won} deal{c.deals_won === 1 ? "" : "s"} won</span>}
              <span className="badge-low">{c.jobs} job{c.jobs === 1 ? "" : "s"}</span>
            </div>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="card p-5 muted">
            {needle ? `No customers match “${needle}”.` : "No customers yet — import a customer roster or invoice export to create them."}
          </div>
        )}
      </div>
    </div>
  );
}
