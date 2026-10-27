import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import JobChecklists from "../../JobChecklist";

export const dynamic = "force-dynamic";

const money = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const usd = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Customer = {
  id: string; name: string; email: string | null; phone: string | null;
  address: string | null; type: string; status: string; preferred_locale: string | null;
  area: string | null; notes: string | null; created_at: string;
};
type Counts = {
  invoices: number; deals: number; jobs: number; agreements: number; comms: number;
  paid: string | number; outstanding: string | number; overdue: string | number;
  open_deal_value: string | number; won_deals: number;
};
type InvoiceRow = {
  id: string; number: string; kind: string; amount: unknown; status: string;
  issued_at: string | null; due_at: string | null; paid_at: string | null;
  job_title: string | null; deal_type: string | null;
};
type DealRow = {
  id: string; deal_type: string; status: string; amount: unknown; created_at: string;
  closed_at: string | null; service_type: string | null;
  year: number | null; make: string | null; model: string | null; stock_number: string | null;
};
type JobRow = {
  id: string; title: string; status: string; amount: unknown; service_type: string | null;
  opened_at: string; completed_at: string | null; invoiced_at: string | null;
  scope: string | null; checklist: unknown; property_address: string | null;
};
type AgreementRow = {
  id: string; plan_name: string; annual_value: unknown; starts_at: string;
  ends_at: string | null; status: string; notes: string | null;
};
type CommRow = {
  id: string; channel: string; direction: string; summary: string; occurred_at: string;
};

const INV_BADGE: Record<string, string> = {
  DRAFT: "badge-low", SENT: "badge-blue", PAID: "badge-green", OVERDUE: "badge-red", VOID: "badge-low",
};
const DEAL_BADGE: Record<string, string> = {
  NEGOTIATING: "badge-blue", PENDING_FINANCE: "badge-orange", WON: "badge-green", LOST: "badge-low",
};
const JOB_BADGE: Record<string, string> = {
  OPEN: "badge-blue", IN_PROGRESS: "badge-purple", AWAITING_PARTS: "badge-orange", COMPLETED: "badge-green",
};
const AGR_BADGE: Record<string, string> = {
  ACTIVE: "badge-green", EXPIRED: "badge-low", CANCELLED: "badge-red",
};

const TABS = ["overview", "invoices", "deals", "jobs", "agreements", "comms"] as const;
type Tab = (typeof TABS)[number];

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const { id } = await params;
  const { tab } = await searchParams;
  if (!UUID.test(id)) notFound();
  const active: Tab = TABS.includes((tab ?? "overview") as Tab) ? ((tab ?? "overview") as Tab) : "overview";

  const [cust] = (await sql`
    select id, name, email, phone, address, type, status, preferred_locale, area, notes, created_at
    from customers where id = ${id} and organization_id = ${orgId}`) as Customer[];
  if (!cust) notFound();

  const [counts] = (await sql`
    select
      (select count(*) from invoices i where i.customer_id = ${id} and i.status <> 'VOID')::int as invoices,
      (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = ${id} and i.status = 'PAID') as paid,
      (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = ${id} and i.status in ('SENT','OVERDUE')) as outstanding,
      (select coalesce(sum(i.amount),0) from invoices i where i.customer_id = ${id} and i.status = 'OVERDUE') as overdue,
      (select count(*) from deals d where d.customer_id = ${id})::int as deals,
      (select count(*) from deals d where d.customer_id = ${id} and d.status = 'WON')::int as won_deals,
      (select coalesce(sum(d.amount),0) from deals d where d.customer_id = ${id} and d.status in ('NEGOTIATING','PENDING_FINANCE')) as open_deal_value,
      (select count(*) from service_orders s where s.customer_id = ${id})::int as jobs,
      (select count(*) from maintenance_agreements a where a.customer_id = ${id})::int as agreements,
      (select count(*) from communications m where m.customer_id = ${id})::int as comms`) as Counts[];

  const tabLink = (k: Tab, label: string, n?: number | string) => (
    <Link
      key={k}
      href={`/pipeline/customers/${id}?tab=${k}`}
      className={`rounded-xl px-3.5 py-2 text-sm transition ${
        active === k
          ? "bg-violet-500/15 font-semibold text-violet-200"
          : "text-navy-100/80 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {label}
      {n != null && Number(n) > 0 && <span className="badge-low ms-2">{String(n)}</span>}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pipeline/customers" className="text-xs text-navy-300 hover:text-white">← All customers</Link>
        <h1 className="page-title mt-1">{cust.name}</h1>
        <p className="page-sub">
          {cust.type}
          {cust.area ? ` · ${cust.area}` : ""}
          {cust.email ? ` · ${cust.email}` : ""}
          {cust.phone ? ` · ${cust.phone}` : ""}
          {cust.address ? ` · ${cust.address}` : ""}
          {cust.preferred_locale ? ` · prefers ${cust.preferred_locale.toUpperCase()}` : ""}
          {" "}· customer since {day(cust.created_at)}
        </p>
      </div>

      {/* Money summary — lifetime paid, still open, and the active agreement value. */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Lifetime paid</div><div className="kpi mt-1 text-emerald-300">{money(counts.paid)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Outstanding AR</div><div className="kpi mt-1 text-emerald-300">{money(counts.outstanding)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Overdue</div><div className="kpi mt-1 text-emerald-300">{Number(counts.overdue) > 0 ? <span className="text-red-400">{money(counts.overdue)}</span> : money(0)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Invoices</div><div className="kpi mt-1 text-emerald-300">{counts.invoices}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Deals won</div><div className="kpi mt-1 text-emerald-300">{counts.won_deals}{counts.open_deal_value ? <span className="text-xs text-navy-300/70"> · {money(counts.open_deal_value)} open</span> : null}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Jobs served</div><div className="kpi mt-1 text-emerald-300">{counts.jobs}</div></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabLink("overview", "Overview")}
        {tabLink("invoices", "Invoices", counts.invoices)}
        {tabLink("deals", "Deals", counts.deals)}
        {tabLink("jobs", "Jobs", counts.jobs)}
        {tabLink("agreements", "Agreements", counts.agreements)}
        {tabLink("comms", "Communications", counts.comms)}
      </div>

      {active === "overview" && (
        <div className="space-y-4">
          {cust.notes && (
            <section className="card p-5">
              <h2 className="section-title mb-2">Notes</h2>
              <p className="text-sm text-navy-100/90">{cust.notes}</p>
            </section>
          )}
          <section className="card p-5">
            <h2 className="section-title mb-2">Account</h2>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline muted">Status: </dt><dd className="inline">{cust.status === "ACTIVE" ? <span className="badge-green">active</span> : <span className="badge-low">{cust.status}</span>}</dd></div>
              <div><dt className="inline muted">Type: </dt><dd className="inline text-navy-100">{cust.type}</dd></div>
              <div><dt className="inline muted">Customer since: </dt><dd className="inline text-navy-100">{day(cust.created_at)}</dd></div>
              {counts.agreements > 0 && (
                <div>
                  <dt className="inline muted">Agreement: </dt>
                  <dd className="inline"><Link className="text-violet-300 underline" href={`/pipeline/customers/${id}?tab=agreements`}>view on the Agreements tab</Link></dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}

      {active === "invoices" && <InvoicesTab customerId={id} />}
      {active === "deals" && <DealsTab customerId={id} />}
      {active === "jobs" && <JobsTab customerId={id} />}
      {active === "agreements" && <AgreementsTab customerId={id} />}
      {active === "comms" && <CommsTab customerId={id} />}
    </div>
  );
}

/* Each tab fetches its own records so a profile load only pays for the tab
   being viewed — scoped to the customer AND the org, never the id alone. */

async function InvoicesTab({ customerId }: { customerId: string }) {
  const rows = (await sql`
    select i.id, i.number, i.kind, i.amount, i.status, i.issued_at, i.due_at, i.paid_at,
      so.title as job_title, d.deal_type
    from invoices i
    left join service_orders so on so.id = i.service_order_id
    left join deals d on d.id = i.deal_id
    where i.customer_id = ${customerId} and i.organization_id = (select organization_id from customers where id = ${customerId})
    order by coalesce(i.issued_at, i.due_at) desc nulls last, i.number desc`) as InvoiceRow[];
  const total = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  return (
    <section className="card p-5">
      <h2 className="section-title mb-3">Invoices ({rows.length}) · {money(total)} total</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-navy-100">{r.number}</span>
              <span className="badge-purple">{r.kind}</span>
              <span className={`badge ms-auto ${INV_BADGE[r.status] ?? "badge-low"}`}>{r.status}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
              <span className="font-semibold text-navy-100">{usd(r.amount)}</span>
              {r.job_title && <span>job: {r.job_title}</span>}
              {r.deal_type && <span>deal: {r.deal_type}</span>}
              <span>issued {day(r.issued_at)}</span>
              <span>due {day(r.due_at)}</span>
              {r.paid_at && <span className="text-emerald-300">paid {day(r.paid_at)}</span>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No invoices yet — draft one from a completed work order in Pipeline.</p>}
      </div>
    </section>
  );
}

async function DealsTab({ customerId }: { customerId: string }) {
  const rows = (await sql`
    select d.id, d.deal_type, d.status, d.amount, d.created_at, d.closed_at, d.service_type,
      v.year, v.make, v.model, v.stock_number
    from deals d left join vehicles v on v.id = d.vehicle_id
    where d.customer_id = ${customerId} and d.organization_id = (select organization_id from customers where id = ${customerId})
    order by d.created_at desc`) as DealRow[];
  return (
    <section className="card p-5">
      <h2 className="section-title mb-3">Deals ({rows.length})</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-navy-100">{r.year ? `${r.year} ${r.make} ${r.model}` : r.deal_type}{r.stock_number ? ` (${r.stock_number})` : ""}</span>
              <span className={`badge ms-auto ${DEAL_BADGE[r.status] ?? "badge-low"}`}>{r.status.replace("_", " ")}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
              <span>{money(r.amount)} · {r.deal_type}</span>
              {r.service_type && <span className="badge-purple">{r.service_type}</span>}
              <span>opened {day(r.created_at)}</span>
              {r.closed_at && <span>closed {day(r.closed_at)}</span>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No deals for this customer.</p>}
      </div>
    </section>
  );
}

async function JobsTab({ customerId }: { customerId: string }) {
  const rows = (await sql`
    select id, title, status, amount, service_type, opened_at, completed_at, invoiced_at, scope, checklist, property_address
    from service_orders
    where customer_id = ${customerId} and organization_id = (select organization_id from customers where id = ${customerId})
    order by opened_at desc`) as JobRow[];
  // One page: every job with its scope + checklist inline, tickable right here —
  // Toni's ask. No more opening each job to find where things stand.
  const jobs = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    unbilled: r.status === "COMPLETED" && !r.invoiced_at,
    amount: money(r.amount),
    serviceType: r.service_type,
    opened: day(r.opened_at),
    completed: r.completed_at ? day(r.completed_at) : null,
    invoiced: r.invoiced_at ? day(r.invoiced_at) : null,
    scope: r.scope,
    propertyAddress: r.property_address,
    checklist: (Array.isArray(r.checklist) ? (r.checklist as { label?: unknown; done?: unknown }[]) : [])
      .filter((i) => i && typeof i.label === "string")
      .map((i) => ({ label: i.label as string, done: Boolean(i.done) })),
  }));
  return <JobChecklists jobs={jobs} />;
}

async function AgreementsTab({ customerId }: { customerId: string }) {
  const rows = (await sql`
    select id, plan_name, annual_value, starts_at, ends_at, status, notes
    from maintenance_agreements
    where customer_id = ${customerId} and organization_id = (select organization_id from customers where id = ${customerId})
    order by starts_at desc`) as AgreementRow[];
  return (
    <section className="card p-5">
      <h2 className="section-title mb-3">Maintenance agreements ({rows.length})</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-navy-100">{r.plan_name}</span>
              <span className={`badge ms-auto ${AGR_BADGE[r.status] ?? "badge-low"}`}>{r.status}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
              <span>{money(r.annual_value)}/yr</span>
              <span>starts {day(r.starts_at)}</span>
              {r.ends_at && <span>ends {day(r.ends_at)}</span>}
            </div>
            {r.notes && <div className="mt-1 text-xs text-navy-300/80">{r.notes}</div>}
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No maintenance agreements — start one from Enhance → Service plans.</p>}
      </div>
    </section>
  );
}

async function CommsTab({ customerId }: { customerId: string }) {
  const rows = (await sql`
    select id, channel, direction, summary, occurred_at
    from communications
    where customer_id = ${customerId} and organization_id = (select organization_id from customers where id = ${customerId})
    order by occurred_at desc`) as CommRow[];
  return (
    <section className="card p-5">
      <h2 className="section-title mb-3">Communications ({rows.length})</h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-blue">{r.channel}</span>
              <span className="badge-low">{r.direction}</span>
              <span className="ms-auto text-xs text-navy-300">{new Date(r.occurred_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-xs text-navy-100/90">{r.summary}</div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No logged communications yet.</p>}
      </div>
    </section>
  );
}
