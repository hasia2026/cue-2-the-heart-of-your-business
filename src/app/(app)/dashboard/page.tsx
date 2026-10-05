import { sql } from "@/lib/db";
import { computeHealth } from "@/lib/health";
import { parseEvidence } from "@/lib/intelligence";
import EvidenceDrawer from "@/components/EvidenceDrawer";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session] = await Promise.all([import("@/lib/auth").then((m) => m.requireSession())]);
  const orgId = session.organizationId;
  const health = await computeHealth(orgId);

  const insights = await sql`
    select id, title, summary, severity, type, impact_value, status, created_at
    from insights where organization_id = ${orgId} and status = 'OPEN'
    order by case severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, impact_value desc nulls last
    limit 6`;
  const [pending] = await sql`
    select count(*)::int as n from recommendations where organization_id = ${orgId} and status = 'PENDING'`;
  const [openTasks] = await sql`
    select count(*)::int as n from tasks where organization_id = ${orgId} and status in ('OPEN','IN_PROGRESS')`;
  const [revenue] = await sql`
    select
      coalesce(sum(case when status='PAID' then amount else 0 end),0)::float as collected,
      coalesce(sum(case when status='OVERDUE' then amount else 0 end),0)::float as overdue
    from invoices where organization_id = ${orgId}`;
  const activity = await sql`
    select action, actor_type, detail, created_at from audit_events
    where organization_id = ${orgId} order by created_at desc limit 8`;
  const tasks = await sql`
    select t.id, t.title, t.status, t.priority, e.name as assignee
    from tasks t left join employees e on e.id = t.assignee_id
    where t.organization_id = ${orgId} and t.status in ('OPEN','IN_PROGRESS')
    order by case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end limit 6`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Business command center</h1>
        <p className="page-sub">What is happening right now — and what deserves your attention.</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-widest text-navy-300">Business health</div>
          <div className="kpi mt-1">{health.overall}</div>
          <div className={`badge mt-2 ${health.grade === "HEALTHY" ? "badge-green" : health.grade === "WATCH" ? "badge-orange" : "badge-red"}`}>
            {health.grade.replace("_", " ")}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-widest text-navy-300">Open insights</div>
          <div className="kpi mt-1">{insights.length}</div>
          <div className="muted mt-2 text-xs">Every one is clickable — evidence inside.</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-widest text-navy-300">Pending decisions</div>
          <div className="kpi mt-1">{pending?.n ?? 0}</div>
          <div className="muted mt-2 text-xs">CUE prepares. You decide.</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-widest text-navy-300">Open tasks</div>
          <div className="kpi mt-1">{openTasks?.n ?? 0}</div>
          <div className="muted mt-2 text-xs">From approved workflows.</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Insights */}
        <section className="lg:col-span-2">
          <h2 className="section-title mb-3">Needs your attention</h2>
          <div className="space-y-2.5">
            {insights.map((i) => (
              <div key={i.id} className="card card-hover p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${i.severity === "HIGH" ? "badge-red" : i.severity === "MEDIUM" ? "badge-orange" : "badge-low"}`}>
                    {i.severity}
                  </span>
                  <span className="badge-blue">{i.type}</span>
                  {i.impact_value != null && (
                    <span className="ms-auto font-semibold text-cue-green">
                      ${Number(i.impact_value).toLocaleString()} at stake
                    </span>
                  )}
                </div>
                <div className="mt-2 font-semibold text-white">{i.title}</div>
                <p className="muted mt-1 line-clamp-2">{i.summary}</p>
                <div className="mt-3"><EvidenceDrawer insightId={i.id} /></div>
              </div>
            ))}
            {insights.length === 0 && (
              <div className="card p-6 text-center muted">
                No open insights. Run <strong>Understand → Refresh intelligence</strong> after new activity.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {/* Revenue signals */}
          <section className="card p-5">
            <h2 className="section-title mb-2">Revenue signals</h2>
            <div className="flex items-baseline justify-between">
              <span className="muted">Collected</span>
              <span className="font-semibold text-cue-green">${Math.round(revenue?.collected ?? 0).toLocaleString()}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="muted">Overdue</span>
              <span className="font-semibold text-cue-orange">${Math.round(revenue?.overdue ?? 0).toLocaleString()}</span>
            </div>
          </section>

          {/* Tasks */}
          <section className="card p-5">
            <h2 className="section-title mb-2">Open tasks</h2>
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.priority === "HIGH" ? "bg-cue-red" : "bg-cue-blue"}`} />
                  <div className="min-w-0">
                    <div className="truncate text-navy-100">{t.title}</div>
                    <div className="text-xs text-navy-300/70">{t.assignee ?? "Unassigned"} · {t.priority}</div>
                  </div>
                </li>
              ))}
              {tasks.length === 0 && <li className="muted">Nothing open.</li>}
            </ul>
          </section>

          {/* Activity */}
          <section className="card p-5">
            <h2 className="section-title mb-2">Recent activity</h2>
            <ul className="space-y-1.5 text-xs">
              {activity.map((a, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className={`mt-0.5 ${a.actor_type === "AI" ? "text-cue-purple" : "text-cue-blue"}`}>
                    {a.actor_type === "AI" ? "✦" : a.actor_type === "SYSTEM" ? "⚙" : "•"}
                  </span>
                  <div className="min-w-0">
                    <span className="text-navy-100">{a.action.replaceAll("_", " ").toLowerCase()}</span>
                    {a.detail && <span className="text-navy-300"> — {a.detail}</span>}
                    <div className="text-navy-300/60">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
              {activity.length === 0 && <li className="muted">No activity yet.</li>}
            </ul>
          </section>
        </aside>
      </div>

      {/* Hidden note: evidence refs parsed for drawer via API; parseEvidence keeps import honest */}
      <span className="hidden">{String(parseEvidence("[]").items.length)}</span>
    </div>
  );
}
