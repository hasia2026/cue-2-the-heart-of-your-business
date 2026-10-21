import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getVocab } from "@/lib/vocab";
import QuoteSender from "./QuoteSender";
import ArReminders from "./ArReminders";
import VisitActions from "./VisitActions";
import LeadFollowUp from "./LeadFollowUp";
import { parseAuthorityBands } from "@/lib/desking";
import { LeadServiceType, DealServiceType } from "./ServiceTypeInputs";
import BackGrossInput from "./BackGrossInput";

export const dynamic = "force-dynamic";

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const ago = (d: Date | string | null) => d ? `${Math.floor((Date.now() - new Date(d).getTime()) / 864e5)}d ago` : "—";

export default async function PipelinePage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const vocab = await getVocab(orgId);

  const leads = await sql`
    select id, name, source, interest, est_value, status, created_at, last_contact_at, next_action_at, service_type
    from leads where organization_id = ${orgId}
    order by (next_action_at is null), next_action_at asc nulls last,
      case status when 'NEW' then 0 when 'CONTACTED' then 1 when 'QUALIFIED' then 2 else 3 end,
      created_at desc limit 12`;
  const deals = await sql`
    select d.id, d.deal_type, d.status, d.amount, d.created_at, c.name as customer,
      v.year, v.make, v.model, v.stock_number, e.name as closer
    from deals d join customers c on c.id = d.customer_id
      left join vehicles v on v.id = d.vehicle_id
      left join employees e on e.id = d.sold_by_id
    where d.organization_id = ${orgId}
    order by case d.status when 'PENDING_FINANCE' then 0 when 'NEGOTIATING' then 1 when 'WON' then 2 else 3 end,
      d.created_at desc limit 12`;
  const inventory = await sql`
    select id, stock_number, year, make, model, trim, kind, status, list_price, listed_at
    from vehicles where organization_id = ${orgId} and status in ('AVAILABLE','RESERVED')
    order by listed_at asc limit 12`;
  const service = await sql`
    select s.id, s.title, s.status, s.amount, s.opened_at, s.completed_at, s.invoiced_at, c.name as customer, s.service_type, e.name as seller
    from service_orders s join customers c on c.id = s.customer_id
      left join employees e on e.id = s.sold_by
    where s.organization_id = ${orgId}
    order by case s.status when 'COMPLETED' then 0 when 'IN_PROGRESS' then 1 else 2 end, s.opened_at desc limit 10`;
  const appts = await sql`
    select a.id, a.title, a.kind, a.scheduled_for, a.status, c.name as customer
    from appointments a join customers c on c.id = a.customer_id
    where a.organization_id = ${orgId} and a.scheduled_for >= now() - interval '1 day'
    order by a.scheduled_for asc limit 8`;

  // Desking profitometer — front/back gross per deal, with discount-
  // authority warnings parsed live from the org's OWN discount policy doc
  // (Deal Desk Discount Authority). Renders even when the doc is absent:
  // bands simply come back empty and the warning column says so.
  const [authDoc] = await sql`
    select id, title, extracted_text from documents
    where organization_id = ${orgId} and (title ilike '%discount%' or title ilike '%authority%')
      and extracted_text is not null
    order by uploaded_at desc limit 1`;
  // Org's own service-type taxonomy for the datalist — most-used first so
  // the manager sees "Diagnostic" before "Warranty" on row five.
  const typeSuggestions = await sql`
    select service_type, count(*)::int as n from (
      select service_type from leads where organization_id = ${orgId} and service_type is not null
      union all
      select service_type from deals where organization_id = ${orgId} and service_type is not null
      union all
      select service_type from service_orders where organization_id = ${orgId} and service_type is not null
    ) t group by service_type order by n desc limit 12`;
  const suggestions = typeSuggestions.map((r) => String(r.service_type));
  const bands = parseAuthorityBands((authDoc?.extracted_text as string) ?? "");
  const capFor = (role: string | null): number | null => {
    if (!role) return null;
    const b = bands.find((x) => x.role === role);
    return b ? b.cap : null;
  };
  const dealsForDesking = await sql`
    select d.id, d.deal_type, d.status, d.amount, d.front_gross, d.back_gross, d.created_at,
      c.name as customer, v.year, v.make, v.model, v.stock_number, v.cost as vehicle_cost,
      e.name as closer, e.title as closer_title, d.sold_by_id
    from deals d
      join customers c on c.id = d.customer_id
      left join vehicles v on v.id = d.vehicle_id
      left join employees e on e.id = d.sold_by_id
    where d.organization_id = ${orgId} and d.status in ('NEGOTIATING','PENDING_FINANCE')
    order by d.created_at desc limit 12`;
  type DeskRow = {
    id: string; customer: string; stock: string | null; label: string;
    front: number; back: number; total: number; discount: number;
    cap: number | null; closer: string; authorityLabel: string; needsSignoff: boolean;
  };
  const deskingRows: DeskRow[] = dealsForDesking.map((d) => {
    const front = Number(d.front_gross ?? 0);
    const back = Number(d.back_gross ?? 0);
    const cost = Number(d.vehicle_cost ?? 0);
    const discount = Math.max(0, cost - front);
    const cap = capFor(d.closer_title ? "MANAGER" : null); // managers desk their own deals
    return {
      id: String(d.id),
      customer: String(d.customer),
      stock: d.stock_number ? String(d.stock_number) : null,
      label: d.year ? `${d.year} ${d.make} ${d.model}` : String(d.deal_type),
      front, back, total: front + back, discount,
      cap,
      closer: d.closer ? String(d.closer) : "—",
      authorityLabel: cap != null
        ? `manager cap $${cap.toLocaleString()}`
        : "no authority doc captured",
      needsSignoff: cap != null && discount > cap,
    };
  });
  const quoteCustomers = await sql`
    select id, name, email, preferred_locale from customers
    where organization_id = ${orgId} and status = 'ACTIVE'
    order by name asc limit 100`;
  // Assemblies for the one-click bundle quote — bundle total computed with
  // each line's saved pricing mode, matching the price-book math.
  const assemblyRows = await sql`
    select a.id, a.name,
      coalesce(sum(
        case i.pricing_mode when 'ADDON'
          then coalesce(o.labor_rate_addon, 0) * coalesce(o.labor_hours, 1) + coalesce(o.parts_cost, 0)
          else coalesce(o.labor_rate_standalone, 0) * coalesce(o.labor_hours, 1) + coalesce(o.parts_cost, 0)
        end
      ), 0)::float as bundle_total
    from service_assemblies a
    left join service_assembly_items i on i.assembly_id = a.id
    left join service_offerings o on o.id = i.offering_id
    where a.organization_id = ${orgId}
    group by a.id, a.name order by a.name`;
  const bundleAssemblies = assemblyRows.map((a) => ({
    id: String(a.id), name: String(a.name), bundleTotal: Number(a.bundle_total) || 0,
  }));

  // Lead-source ROI: group by the lead's origin channel and its terminal
  // (or open) status so an owner can see "referral beats GMB" with dollars,
  // not vibes. Renders only when at least one lead has been grouped.
  const sourceBoard = await sql`
    select coalesce(source_origin, source) as origin, source_status,
      count(*)::int as n, coalesce(sum(est_value), 0)::numeric(14,2) as value
    from leads where organization_id = ${orgId}
    group by coalesce(source_origin, source), source_status
    order by sum(est_value) desc nulls last, count(*) desc`;

  // Tech-sold attribution: revenue parked under the employee who SOLD the
  // work, separate from who completed it — the HCP “track the total revenue
  // generated from jobs personally sold or created by each technician” ask.
  const techBoard = await sql`
    select e.id, e.name, e.title,
      count(*)::int as jobs_sold,
      coalesce(sum(-s.amount), 0)::numeric(14,2) as sold_value,
      count(*) filter (where s.status in ('OPEN','IN_PROGRESS','AWAITING_PARTS'))::int as open_jobs,
      (select count(*)::int from service_orders s2
        where s2.organization_id = ${orgId} and s2.sold_by = e.id and s2.sold_by_is_tech) as tech_completed
    from employees e
    join service_orders s on s.sold_by = e.id and s.organization_id = ${orgId}
    where e.organization_id = ${orgId}
    group by e.id, e.name, e.title
    order by sold_value desc`;

  // Job-type mix: how many diagnostic vs. replacement vs. panel vs. EV
  // charger vs. maintenance calls — the “Install and Repair are way too
  // broad” tracking ask, implemented on our service order label.
  const typeMix = await sql`
    select coalesce(service_type, 'Other') as service_type, count(*)::int as n,
      coalesce(sum(amount), 0)::numeric(14,2) as value
    from service_orders where organization_id = ${orgId}
    group by coalesce(service_type, 'Other')
    order by count(*) desc`;

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
        <QuoteSender customers={quoteCustomers as never} assemblies={bundleAssemblies} />
      </section>

      {/* AR automation: draft-first payment reminders in the customer's language. */}
      <ArReminders canSend={session.role !== "MEMBER"} />

      {/* Lead-source ROI board — dollars by channel × lifecycle status. */}
      {sourceBoard.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-1">Lead-source ROI</h2>
          <p className="muted mb-3 text-xs">Dollars by origin channel and lifecycle state — so “referral beats Google” is provable, not vibes. Won+Lost opens the door for close-rate math too.</p>
          <div className="space-y-2">
            {sourceBoard.map((s) => (
              <div key={`${s.origin}-${s.source_status}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                <span className="badge-blue">{String(s.origin).replace("_", " ")}</span>
                <span className={`badge ${s.source_status === "CLOSED_WON" ? "badge-green" : s.source_status === "CLOSED_LOST" ? "badge-low" : "badge-purple"}`}>
                  {s.source_status ?? "OPEN"}
                </span>
                <span className="ms-auto text-xs text-navy-300">
                  {s.n} lead{s.n === 1 ? "" : "s"} · {money(s.value)} est.
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Job-type + revenue attribution board — the two reports the owner
          asked for by name. */}
      {(techBoard.length > 0 || typeMix.length > 0) && (
        <div className="grid gap-6 xl:grid-cols-2">
          {techBoard.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-1">Revenue by seller</h2>
              <p className="muted mb-3 text-xs">Closed service-order dollars parked under who sold the work — split from who completed it. “Tech-completed” counts jobs that tech themselves closed in the field.</p>
              <div className="space-y-2">
                {techBoard.map((t, i) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                    <span className={`badge ${i === 0 ? "badge-green" : "badge-low"}`}>{i === 0 ? "top" : `#${i + 1}`}</span>
                    <span className="font-medium text-navy-100">{t.name}</span>
                    <span className="text-xs text-navy-300">{t.title}</span>
                    <span className="ms-auto flex flex-wrap gap-2 text-xs">
                      <span className="badge-green">{t.jobs_sold} sold · {money(t.sold_value)}</span>
                      {Number(t.tech_completed) > 0 && <span className="badge-blue">{t.tech_completed} tech-completed</span>}
                      <span className="badge-purple">{t.open_jobs} open</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {typeMix.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-1">Job-type mix</h2>
              <p className="muted mb-3 text-xs">Diagnostic vs. panel-swap vs. EV-charger vs. maintenance vs. replacement — richer than a plain “Install/Repair” split, because the dollars don't behave the same in each bucket.</p>
              <div className="space-y-2">
                {typeMix.map((m) => (
                  <div key={m.service_type} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                    <span className="badge-purple">{m.service_type}</span>
                    <span className="ms-auto text-xs text-navy-300">{m.n} job{m.n === 1 ? "" : "s"} · {money(m.value)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
                  </div>                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
                    <span>{money(l.est_value)} est.</span>
                    <span>last contact: {ago(l.last_contact_at ?? l.created_at)}</span>
                    {l.service_type && <span className="badge-purple">{l.service_type}</span>}
                  <LeadServiceType
                    leadId={l.id}
                    value={l.service_type ? String(l.service_type) : null}
                    suggestions={suggestions}
                    canEdit={session.role !== "MEMBER"}
                  />
                    {l.interest && <span className="truncate">· {l.interest}</span>}
                  </div>
                  <div className="mt-1.5">
                    <LeadFollowUp
                      leadId={l.id}
                      nextActionAt={l.next_action_at ? String(l.next_action_at) : null}
                      lastContactedAgoDays={Math.floor((Date.now() - new Date(l.last_contact_at ?? l.created_at).getTime()) / 864e5)}
                      canEdit={session.role !== "MEMBER"}
                    />
                  </div>
                </div>
              );
            })}
            {leads.length === 0 && <p className="muted">No leads yet.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="section-title mb-1">Desking profitometer</h2>
          <p className="muted mb-3 text-xs">
            Front/back gross per open deal, with discount-authority warnings read from your own
            Deal Desk Discount Authority policy — not hardcoded. Discount &gt; cap lights red;
            the walkaround video automation angle is your days-to-turn lever, this is your
            gross-per-car lever.
          </p>
          <div className="space-y-2">
            {deskingRows.map((d) => {
              const grossPct = d.cap && d.total > 0
                ? Math.min(200, Math.round((d.total / d.cap) * 100))
                : 0;
              return (
                <div key={d.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy-100">{d.customer}</span>
                    <span className="text-xs text-navy-300">{d.label}{d.stock ? ` · ${d.stock}` : ""}</span>
                    {d.needsSignoff ? (
                      <span className="badge-red ms-auto">⚠ {d.authorityLabel}</span>
                    ) : d.cap != null ? (
                      <span className="badge-green ms-auto">✓ {d.authorityLabel}</span>
                    ) : (
                      <span className="badge-low ms-auto">{d.authorityLabel}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="badge-blue">front {money(d.front)}</span>
                    <BackGrossInput dealId={d.id} value={d.back} canEdit={session.role !== "MEMBER"} />
                    <span className="badge-green">total {money(d.total)}</span>
                    <span className="text-navy-300">discount {money(d.discount)} · {d.closer}</span>
                  </div>
                  {d.cap != null && d.total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div
                        className={`h-1.5 rounded-full ${d.needsSignoff ? "bg-red-500" : grossPct > 100 ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ width: `${Math.max(3, Math.min(100, grossPct / 2))}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {deskingRows.length === 0 && <p className="muted">No open deals to desk.</p>}
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
                  {d.year ? `${d.year} ${d.make} ${d.model} (${d.stock_number}) · ` : ""}{money(d.amount)} · {d.deal_type}{d.closer ? <> · closer: <span className="text-navy-100">{d.closer}</span></> : null}
                  <DealServiceType
                    dealId={d.id}
                    value={d.service_type ? String(d.service_type) : null}
                    suggestions={suggestions}
                    canEdit={session.role !== "MEMBER"}
                  />
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
                  {s.service_type && s.service_type !== "Other" && (
                    <span className="badge-purple">{s.service_type}</span>
                  )}
                  <span className={`badge ms-auto ${s.status === "COMPLETED" && !s.invoiced_at ? "badge-red" : s.status === "COMPLETED" ? "badge-green" : "badge-blue"}`}>
                    {s.status === "COMPLETED" && !s.invoiced_at ? "UNBILLED" : s.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-navy-300">
                  {s.customer} · {money(s.amount)}{s.seller ? " · sold by " + s.seller : ""}
                </div>
              </div>
            ))}
            {service.length === 0 && <p className="muted">{vocab.serviceEmpty}</p>}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-1">Upcoming &amp; today's visits</h2>
        <p className="muted mb-3 text-xs">Multi-visit jobs: “Done today” closes this visit only — a later follow-up on the same job stays scheduled, without touching the calendar or the daily report.</p>
        <div className="flex flex-wrap gap-2">
          {appts.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-navy-100">{a.title}</span>
                <span className={`badge ms-auto ${a.status === "COMPLETED" ? "badge-green" : a.status === "NO_SHOW" ? "badge-orange" : "badge-blue"}`}>
                  {a.status.replace("_", " ")}
                </span>
              </div>
              <div className="text-xs text-navy-300">{a.customer} · {new Date(a.scheduled_for).toLocaleString()} · {a.kind.replace("_", " ")}</div>
              <div className="mt-1.5">
                <VisitActions apptId={a.id} status={a.status} canEdit={session.role !== "MEMBER"} />
              </div>
            </div>
          ))}
          {appts.length === 0 && <p className="muted">Nothing scheduled.</p>}
        </div>
      </section>
    </div>
  );
}
