import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getVocab } from "@/lib/vocab";
import QuoteSender from "./QuoteSender";

export const dynamic = "force-dynamic";

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const ago = (d: Date | string | null) => d ? `${Math.floor((Date.now() - new Date(d).getTime()) / 864e5)}d ago` : "—";

export default async function PipelinePage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const vocab = await getVocab(orgId);

  const leads = await sql`
    select id, name, source, interest, est_value, status, created_at, last_contact_at
    from leads where organization_id = ${orgId}
    order by case status when 'NEW' then 0 when 'CONTACTED' then 1 when 'QUALIFIED' then 2 else 3 end, created_at desc limit 12`;
  const deals = await sql`
    select d.id, d.deal_type, d.status, d.amount, d.created_at, c.name as customer,
      v.year, v.make, v.model, v.stock_number
    from deals d join customers c on c.id = d.customer_id left join vehicles v on v.id = d.vehicle_id
    where d.organization_id = ${orgId}
    order by case d.status when 'PENDING_FINANCE' then 0 when 'NEGOTIATING' then 1 when 'WON' then 2 else 3 end,
      d.created_at desc limit 12`;
  const inventory = await sql`
    select id, stock_number, year, make, model, trim, kind, status, list_price, listed_at
    from vehicles where organization_id = ${orgId} and status in ('AVAILABLE','RESERVED')
    order by listed_at asc limit 12`;
  const service = await sql`
    select s.id, s.title, s.status, s.amount, s.opened_at, s.completed_at, s.invoiced_at, c.name as customer
    from service_orders s join customers c on c.id = s.customer_id
    where s.organization_id = ${orgId}
    order by case s.status when 'COMPLETED' then 0 when 'IN_PROGRESS' then 1 else 2 end, s.opened_at desc limit 10`;
  const appts = await sql`
    select a.id, a.title, a.kind, a.scheduled_for, a.status, c.name as customer
    from appointments a join customers c on c.id = a.customer_id
    where a.organization_id = ${orgId} and a.scheduled_for >= now() - interval '1 day'
    order by a.scheduled_for asc limit 8`;
  const quoteCustomers = await sql`
    select id, name, email, preferred_locale from customers
    where organization_id = ${orgId} and status = 'ACTIVE'
    order by name asc limit 100`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Pipeline</h1>
        <p className="page-sub">{vocab.pipelineSub}</p>
      </div>

      {/* Localized quote delivery: pick a customer, one-line quote, go —
          the language resolves from their stored preference unless overridden. */}
      <section className="card p-5">
        <h2 className="section-title mb-1">Send a localized quote</h2>
        <p className="muted mb-3 text-xs">Goes out in the household's language — their stored preference wins unless you override it here. Email via Resend when connected; audit-logged either way.</p>
        <QuoteSender customers={quoteCustomers as never} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="section-title mb-3">Leads (oldest contact first)</h2>
          <div className="space-y-2">
            {leads.map((l) => {
              const stale = !l.last_contact_at && Date.now() - new Date(l.created_at).getTime() > 5 * 864e5;
              return (
                <div key={l.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy-100">{l.name}</span>
                    <span className="badge-low">{l.source.replace("_", " ")}</span>
                    <span className={`badge ms-auto ${stale ? "badge-red" : "badge-green"}`}>{stale ? "stale" : l.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
                    <span>{money(l.est_value)} est.</span>
                    <span>last contact: {ago(l.last_contact_at ?? l.created_at)}</span>
                    {l.interest && <span className="truncate">· {l.interest}</span>}
                  </div>
                </div>
              );
            })}
            {leads.length === 0 && <p className="muted">No leads yet.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="section-title mb-3">Deals</h2>
          <div className="space-y-2">
            {deals.map((d) => (
              <div key={d.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-navy-100">{d.customer}</span>
                  <span className={`badge ms-auto ${d.status === "WON" ? "badge-green" : d.status === "LOST" ? "badge-low" : d.status === "PENDING_FINANCE" ? "badge-orange" : "badge-blue"}`}>
                    {d.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-navy-300">
                  {d.year ? `${d.year} ${d.make} ${d.model} (${d.stock_number}) · ` : ""}{money(d.amount)} · {d.deal_type}
                </div>
              </div>
            ))}
            {deals.length === 0 && <p className="muted">No deals yet.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="section-title mb-3">{vocab.inventoryTitle}</h2>
          <div className="space-y-2">
            {inventory.map((v) => {
              const dol = Math.floor((Date.now() - new Date(v.listed_at).getTime()) / 864e5);
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-sm">
                  <span className={`badge ${dol > 60 ? "badge-red" : dol > 45 ? "badge-orange" : "badge-green"}`}>{dol}d</span>
                  <span className="font-medium text-navy-100">{v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}</span>
                  <span className="text-xs text-navy-300">({v.stock_number} · {v.kind})</span>
                  <span className="ms-auto font-semibold text-navy-100">{money(v.list_price)}</span>
                </div>
              );
            })}
            {inventory.length === 0 && <p className="muted">{vocab.inventoryEmpty}</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="section-title mb-3">{vocab.serviceTitle}</h2>
          <div className="space-y-2">
            {service.map((s) => (
              <div key={s.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-navy-100">{s.title}</span>
                  <span className={`badge ms-auto ${s.status === "COMPLETED" && !s.invoiced_at ? "badge-red" : s.status === "COMPLETED" ? "badge-green" : "badge-blue"}`}>
                    {s.status === "COMPLETED" && !s.invoiced_at ? "UNBILLED" : s.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-navy-300">{s.customer} · {money(s.amount)}</div>
              </div>
            ))}
            {service.length === 0 && <p className="muted">{vocab.serviceEmpty}</p>}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-3">Upcoming appointments</h2>
        <div className="flex flex-wrap gap-2">
          {appts.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-sm">
              <div className="font-medium text-navy-100">{a.title}</div>
              <div className="text-xs text-navy-300">{a.customer} · {new Date(a.scheduled_for).toLocaleString()} · {a.kind.replace("_", " ")}</div>
            </div>
          ))}
          {appts.length === 0 && <p className="muted">Nothing scheduled.</p>}
        </div>
      </section>
    </div>
  );
}
