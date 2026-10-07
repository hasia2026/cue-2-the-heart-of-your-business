import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { ACADEMY_LABEL_KEYS, LIBRARY_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import Academy from "./Academy";
import TrainingLibrary from "./TrainingLibrary";

export const dynamic = "force-dynamic";

export default async function ExpandPage() {
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;
  const [profile] = await sql`select industry, mission, offerings, target_customers from business_profiles where organization_id = ${orgId}`;

  // Scal³ — revenue intelligence strip: money in motion + recovered through CUE workflows
  const [scal] = await sql`
    select
      (select coalesce(sum(amount),0) from invoices where organization_id = ${orgId} and status='PAID')::float as collected,
      (select coalesce(sum(amount),0) from invoices where organization_id = ${orgId} and status='OVERDUE')::float as overdue,
      (select coalesce(sum(est_value),0) from leads where organization_id = ${orgId} and status in ('NEW','CONTACTED','QUALIFIED'))::float as pipeline,
      (select coalesce(sum(i.amount),0) from invoices i join service_orders s on s.id = i.service_order_id
        where i.organization_id = ${orgId} and i.status='PAID' and s.invoiced_at is not null
        and s.completed_at is not null and i.issued_at - s.completed_at > interval '48 hours')::float as recovered_late
  `;

  const libRows = await sql`
    select m.id, m.title, m.summary, m.category, m.content_url as "contentUrl", m.content, m.quiz,
      (select count(*) from training_attempts a where a.module_id = m.id)::int as attempts,
      (select coalesce(round(avg(a.score::numeric / greatest(a.total, 1) * 100)), 0)::int from training_attempts a where a.module_id = m.id) as "avgScore",
      (select (a.score || ':' || a.total) from training_attempts a where a.module_id = m.id and a.user_id = ${session.user.id} order by a.created_at desc limit 1) as mine
    from training_modules m
    where m.organization_id = ${orgId} and m.source = 'IMPORTED'
    order by m.created_at desc`;
  const teamRows = await sql`
    select u.name, u.email, count(*)::int as attempts,
      coalesce(round(avg(a.score::numeric / greatest(a.total, 1) * 100)), 0)::int as "avgScore",
      max(a.created_at)::text as "lastAt"
    from training_attempts a join users u on u.id = a.user_id
    where a.organization_id = ${orgId}
    group by u.name, u.email
    order by "avgScore" desc nulls last`;
  const myProgressRows = await sql`
    select track, lesson from academy_progress
    where organization_id = ${orgId} and user_id = ${session.user.id}`;
  const myAssignedRows = await sql`
    select track from academy_assignments
    where organization_id = ${orgId} and user_id = ${session.user.id}`;
  const memberRows = await sql`
    select u.id, u.name from members m join users u on u.id = m.user_id
    where m.organization_id = ${orgId} order by u.name`;
  const assignRows = await sql`
    select aa.id, aa.track, u.name,
      (select count(*) from academy_progress p
        where p.organization_id = aa.organization_id and p.user_id = aa.user_id and p.track = aa.track)::int as done
    from academy_assignments aa join users u on u.id = aa.user_id
    where aa.organization_id = ${orgId}
    order by aa.assigned_at desc`;
  const trainings = await sql`
    select t.id, t.title, t.summary, t.category, t.source,
      (select count(*) from training_assignments ta where ta.training_id = t.id)::int as assigned,
      (select count(*) from training_assignments ta where ta.training_id = t.id and ta.status='COMPLETED')::int as completed
    from training_modules t where t.organization_id = ${orgId} order by t.created_at desc`;
  const opportunities = await sql`
    select id, title, summary, impact_value, status from insights
    where organization_id = ${orgId} and type in ('OPPORTUNITY','REVENUE')
    order by created_at desc limit 8`;
  const outcomes = await sql`
    select w.title, w.status, w.created_at,
      (select count(*) from tasks t where t.workflow_id = w.id and t.status='DONE')::int as done,
      (select count(*) from tasks t where t.workflow_id = w.id)::int as total
    from workflows w where w.organization_id = ${orgId} order by w.created_at desc limit 6`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("expand.title")}</h1>
        <p className="page-sub">{t("expand.subtitle")}</p>
      </div>

      <Academy
        industry={(profile?.industry as string) ?? ""}
        mission={(profile?.mission as string) ?? ""}
        customers={(profile?.target_customers as string) ?? ""}
        offerings={(profile?.offerings as string) ?? ""}
        labels={buildLabels(ACADEMY_LABEL_KEYS, t)}
        myProgress={myProgressRows.map((r) => `${r.track}.${r.lesson}`)}
        assignedTracks={myAssignedRows.map((r) => r.track as string)}
        canManage={session.role !== "MEMBER"}
        members={memberRows.map((m) => ({ id: m.id, name: m.name }))}
        team={assignRows.map((r) => ({ id: r.id, name: r.name, track: r.track as string, done: Number(r.done) }))}
      />

      <TrainingLibrary
        labels={buildLabels(LIBRARY_LABEL_KEYS, t)}
        canImport={session.role !== "MEMBER"}
        team={teamRows.map((r) => ({ name: r.name, email: r.email, attempts: r.attempts, avgScore: Number(r.avgScore), lastAt: r.lastAt }))}
        modules={libRows.map((m) => {
          const mine = typeof m.mine === "string" ? m.mine.split(":") : null;
          return {
            id: m.id, title: m.title, summary: m.summary, category: m.category,
            contentUrl: m.contentUrl, content: m.content,
            quiz: (m.quiz ?? []) as { q: string; choices: string[]; answer: number }[],
            attempts: m.attempts, avgScore: Number(m.avgScore),
            myScore: mine ? Number(mine[0]) : null,
            myTotal: mine ? Number(mine[1]) : null,
          };
        })}
      />

      {/* Scal³ — Revenue Intelligence */}
      <section className="card p-5">
        <div className="flex items-center gap-2">
          <h2 className="bg-gradient-to-r from-cue-blue via-cue-purple to-cue-orange bg-clip-text text-lg font-bold text-transparent">Scal³</h2>
          <span className="badge-purple">Revenue Intelligence</span>
          <span className="muted ms-auto text-xs">Money in motion — computed from your records</span>
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

      <section>
        <h2 className="section-title mb-3">Training from your knowledge</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {trainings.map((t) => {
            const pct = t.assigned ? Math.round((t.completed / t.assigned) * 100) : 0;
            return (
              <div key={t.id} className="card p-5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{t.title}</span>
                  <span className="badge-purple ms-auto">{t.category}</span>
                </div>
                <p className="muted mt-1 text-xs">{t.summary}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-cue-green" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 text-xs text-navy-300">{t.completed}/{t.assigned} completed ({pct}%) · {t.source === "AI_GENERATED" ? "✦ generated by CUE" : "manual"}</div>
              </div>
            );
          })}
          {trainings.length === 0 && <div className="card p-5 muted">No training yet. CUE generates modules from your captured knowledge.</div>}
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">Growth opportunities</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {opportunities.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{o.title}</span>
                {o.impact_value != null && <span className="ms-auto font-semibold text-cue-green">${Number(o.impact_value).toLocaleString()}</span>}
              </div>
              <p className="muted mt-1 text-sm">{o.summary}</p>
            </div>
          ))}
          {opportunities.length === 0 && <div className="card p-5 muted">Opportunities appear here as CUE detects them.</div>}
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">Outcome tracking — did actions work?</h2>
        <div className="space-y-2">
          {outcomes.map((w, i) => (
            <div key={i} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-navy-100">{w.title}</div>
                <div className="text-xs text-navy-300/70">started {new Date(w.created_at).toLocaleDateString()}</div>
              </div>
              <div className="text-sm text-navy-100">{w.done}/{w.total} tasks</div>
              <span className={`badge ${w.status === "COMPLETED" ? "badge-green" : "badge-blue"}`}>{w.status}</span>
            </div>
          ))}
          {outcomes.length === 0 && <div className="card p-5 muted">Completed workflows land here with results.</div>}
        </div>
      </section>
    </div>
  );
}
