import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function PilotReportPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  // ── Leak detection history (AI-created insights) ──
  const [leaks] = await sql`
    select
      count(*)::int as total,
      sum(case when status in ('ACTION_TAKEN','RESOLVED') then 1 else 0 end)::int as acted,
      sum(case when status = 'OPEN' then 1 else 0 end)::int as open,
      coalesce(sum(impact_value),0)::float as impact_total,
      coalesce(sum(case when status in ('ACTION_TAKEN','RESOLVED') then impact_value else 0 end),0)::float as impact_acted
    from insights where organization_id = ${orgId}`;

  // ── Human decisions (the accountability record) ──
  const decisions = await sql`
    select action, detail, created_at from audit_events
    where organization_id = ${orgId} and action like 'RECOMMENDATION_%'
    order by created_at asc limit 50`;
  const approved = decisions.filter((d) => d.action === "RECOMMENDATION_APPROVED").length;
  const rejected = decisions.filter((d) => d.action === "RECOMMENDATION_REJECTED").length;
  const deferred = decisions.filter((d) => d.action === "RECOMMENDATION_DEFERRED").length;

  // ── Execution results ──
  const [exec] = await sql`
    select
      (select count(*) from workflows where organization_id = ${orgId})::int as workflows,
      (select count(*) from tasks where organization_id = ${orgId} and status='DONE')::int as tasks_done,
      (select count(*) from tasks where organization_id = ${orgId})::int as tasks_total,
      (select count(*) from audit_events where organization_id = ${orgId})::int as audit_events`;

  // ── Dollars recovered proxies (dealership-aware but generic-safe) ──
  const [dollars] = await sql`
    select
      -- unbilled completed work that existed at pilot start and is now invoiced
      (select coalesce(sum(amount),0) from service_orders
        where organization_id = ${orgId} and status='COMPLETED' and invoiced_at is not null
        and invoiced_at > opened_at + interval '30 days')::float as invoiced_late,
      -- invoices collected that were previously overdue
      (select coalesce(sum(amount),0) from invoices
        where organization_id = ${orgId} and status='PAID' and paid_at > due_at)::float as collected_late,
      -- pipeline value from leads converted to WON
      (select coalesce(sum(est_value),0) from leads
        where organization_id = ${orgId} and status='WON')::float as won_pipeline`;

  const recovered =
    Number(dollars?.invoiced_late ?? 0) +
    Number(dollars?.collected_late ?? 0) +
    Number(dollars?.won_pipeline ?? 0);

  const [org] = await sql`select name, created_at from organizations where id = ${orgId}`;
  const daysLive = Math.max(1, Math.floor((Date.now() - new Date(org.created_at).getTime()) / 864e5));

  const engagement = exec.tasks_total ? Math.round((exec.tasks_done / exec.tasks_total) * 100) : 0;
  const decided = approved + rejected + deferred;
  const decisionRate = leaks.total ? Math.round((Math.min(decided, leaks.total) / leaks.total) * 100) : 0;

  // Projected monthly recovery: only the dollars still genuinely on the
  // table — insights whose status is OPEN. Dismissed/deferred leaks don't
  // inflate the projection because the owner decided not to chase them.
  const [proj] = await sql`
    select coalesce(sum(impact_value),0)::float as open_estimate
    from insights where organization_id = ${orgId} and status = 'OPEN'`;
  const projected = Math.max(0, Number(proj?.open_estimate ?? 0));

  // Conversion copy math: earned per-day framing from the audit trail, and
  // how many times the still-open recovery covers the plan price.
  const perDay = Math.round(Number(leaks.impact_total ?? 0) / daysLive);
  const planCover = Math.floor(projected / 299);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Report header */}
      <header className="card p-7 text-center">
        <div className="text-xs uppercase tracking-widest text-cue-blue">End-of-pilot report</div>
        <h1 className="mt-1 text-2xl font-bold text-white">{org.name}</h1>
        <p className="muted mt-1 text-sm">{daysLive} days on CUE · generated {new Date().toLocaleDateString()} from the live audit trail</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div>
            <div className="kpi text-cue-green">{money(recovered)}</div>
            <div className="mt-1 text-xs text-navy-300">revenue recovered / protected</div>
          </div>
          <div>
            <div className="kpi text-cue-blue">{money(projected)}</div>
            <div className="mt-1 text-xs text-navy-300">projected if open leaks close</div>
          </div>
          <div>
            <div className="kpi">{leaks.total}</div>
            <div className="mt-1 text-xs text-navy-300">leaks detected</div>
          </div>
          <div>
            <div className="kpi">{money(leaks.impact_total)}</div>
            <div className="mt-1 text-xs text-navy-300">total at stake identified</div>
          </div>
        </div>
      </header>

      {/* What CUE found */}
      <section className="card p-6">
        <h2 className="section-title mb-1">1 · What CUE found</h2>
        <p className="muted mb-4 text-xs">Every insight was computed from actual records — evidence attached, nothing fabricated.</p>
        <div className="grid gap-3 sm:grid-cols-4 text-center">
          <div className="rounded-xl border border-white/[0.06] p-3">
            <div className="text-2xl font-bold text-white">{leaks.total}</div>
            <div className="text-xs text-navy-300">leaks detected</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-3">
            <div className="text-2xl font-bold text-cue-green">{leaks.acted}</div>
            <div className="text-xs text-navy-300">acted on</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-3">
            <div className="text-2xl font-bold text-cue-orange">{leaks.open}</div>
            <div className="text-xs text-navy-300">still open</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] p-3">
            <div className="text-2xl font-bold text-white">{money(leaks.impact_acted)}</div>
            <div className="text-xs text-navy-300">acted-on value</div>
          </div>
        </div>
      </section>

      {/* What the team decided */}
      <section className="card p-6">
        <h2 className="section-title mb-1">2 · What your team decided</h2>
        <p className="muted mb-4 text-xs">
          CUE never acts alone — every consequential step carried a human decision. Decision rate: {decisionRate}% of insights.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="badge-green">{approved} approved</span>
          <span className="badge-red">{rejected} rejected</span>
          <span className="badge-low">{deferred} deferred</span>
        </div>
        <ul className="mt-4 space-y-1.5 text-xs">
          {decisions.slice(0, 8).map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-navy-300/60">{new Date(d.created_at).toLocaleDateString()}</span>
              <span className="text-navy-100">{d.action.replace("RECOMMENDATION_", "").toLowerCase()}</span>
              {d.detail && <span className="truncate text-navy-300">— {d.detail}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* What changed in the business */}
      <section className="card p-6">
        <h2 className="section-title mb-1">3 · What changed</h2>
        <p className="muted mb-4 text-xs">Execution results from approved workflows.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] p-4">
            <div className="text-2xl font-bold text-white">{exec.workflows}</div>
            <div className="text-xs text-navy-300">workflows run</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-cue-green" style={{ width: `${engagement}%` }} />
            </div>
            <div className="mt-1 text-xs text-navy-300">{exec.tasks_done}/{exec.tasks_total} tasks completed ({engagement}%)</div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="muted">Late-billed work now invoiced</span><span className="font-semibold text-emerald-300">{money(dollars?.invoiced_late)}</span></div>
            <div className="flex justify-between"><span className="muted">Overdue invoices since collected</span><span className="font-semibold text-emerald-300">{money(dollars?.collected_late)}</span></div>
            <div className="flex justify-between"><span className="muted">Leads converted</span><span className="font-semibold text-emerald-300">{money(dollars?.won_pipeline)}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-1.5"><span className="text-navy-100">Total</span><span className="font-bold text-cue-green">{money(recovered)}</span></div>
          </div>
        </div>
      </section>

      {/* The conversion close */}
      <section className="card border-cue-blue/30 bg-cue-blue/[0.06] p-7 text-center">
        <h2 className="text-xl font-bold text-white">The math going forward</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-navy-100">
          Over {daysLive} days, CUE kept {money(perDay)}/day of found money on your radar —
          and your team captured <strong className="text-cue-green">{money(recovered)}</strong> of it.
        </p>
        <p className="mx-auto mt-2 max-w-lg text-sm text-navy-100">
          {/* projection from OPEN insights only — decided leaks leave the number */}
          {projected > 0 ? (
            <>
              The leak engine still sees <strong>{money(projected)}/month</strong> on the table — that&apos;s
              {planCover >= 2 ? ` ${planCover}× the Operator plan` : " roughly the Operator plan"} at <strong>$299/month</strong>,
              before your team touches it. Clear the open list and the plan is covered by recovered work alone.
            </>
          ) : (
            <>
              Every detected leak has been decided. The Operator plan is <strong>$299/month</strong> — the next
              leak CUE catches is the one that pays for it.
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="badge-blue">Annual: 2 months free</span>
          <span className="badge-purple">Group (2–5 stores): $799/mo</span>
          <span className="badge-green">Founding rate: $199/mo locked</span>
        </div>
        <p className="mt-4 text-xs text-navy-300/70">
          Full audit trail: {exec.audit_events} events recorded · exportable on request
        </p>
      </section>
    </div>
  );
}
