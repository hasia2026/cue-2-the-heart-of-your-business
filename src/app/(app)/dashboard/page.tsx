import { sql } from "@/lib/db";
import { computeHealth } from "@/lib/health";
import { getT } from "@/lib/locale";
import { LogoMark } from "@/components/NavClient";
import EvidenceDrawer from "@/components/EvidenceDrawer";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session] = await Promise.all([import("@/lib/auth").then((m) => m.requireSession())]);
  const orgId = session.organizationId;
  const { t } = await getT();
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

  const collected = Math.round(revenue?.collected ?? 0);
  const overdue = Math.round(revenue?.overdue ?? 0);
  const totalBilled = collected + overdue;
  const collectedPct = totalBilled > 0 ? Math.round((collected / totalBilled) * 100) : 100;
  const gradeBadge =
    health.grade === "HEALTHY" ? "badge-green" : health.grade === "WATCH" ? "badge-orange" : "badge-red";

  const strip: { label: string; value: string; caption: string; dot: string }[] = [
    { label: t("dash.health"), value: String(health.overall), caption: health.grade.replace("_", " "), dot: "bg-violet-400" },
    { label: t("dash.openInsights"), value: String(insights.length), caption: t("dash.clickable"), dot: "bg-cyan-400" },
    { label: t("dash.pendingDecisions"), value: String(pending?.n ?? 0), caption: t("dash.cuePrepares"), dot: "bg-fuchsia-400" },
    { label: t("dash.openTasks"), value: String(openTasks?.n ?? 0), caption: t("dash.fromWorkflows"), dot: "bg-orange-400" },
    { label: t("dash.collected"), value: "$" + collected.toLocaleString(), caption: `${collectedPct}%`, dot: "bg-emerald-400" },
    { label: t("dash.overdue"), value: "$" + overdue.toLocaleString(), caption: t("dash.attention"), dot: "bg-red-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero band — emblem, command-center title, glowing health score */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="cue-halo shrink-0">
            <LogoMark className="h-16 w-16" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-2">CUE · {t("app.tagline")}</div>
            <h1 className="text-2xl font-bold leading-tight text-white md:text-4xl">
              {t("dash.title").split(" ").slice(0, -1).join(" ")}{" "}
              <span className="hero-gradient">{t("dash.title").split(" ").slice(-1)}</span>
            </h1>
            <p className="muted mt-2 max-w-xl text-sm">{t("dash.subtitle")}</p>
          </div>
          <div className="text-center">
            <div className="cue-halo inline-flex rounded-2xl px-6 py-3">
              <span className="kpi !text-5xl">{health.overall}</span>
            </div>
            <div className="eyebrow mt-2">{t("dash.health")}</div>
            <div className={`badge mt-1 ${gradeBadge}`}>{health.grade.replace("_", " ")}</div>
          </div>
        </div>
      </section>

      {/* Neon stat strip — poster bottom band */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {strip.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot} shadow-glow`} />
              <span className="truncate text-[10px] uppercase tracking-[0.18em] text-navy-300">{s.label}</span>
            </div>
            <div className="kpi mt-1.5 !text-2xl">{s.value}</div>
            <div className="muted mt-0.5 truncate text-[11px]">{s.caption}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Insights — poster-style panel with colored rows */}
        <section className="lg:col-span-2">
          <h2 className="eyebrow mb-3 !text-cyan-300">{t("dash.attention")}</h2>
          <div className="space-y-2.5">
            {insights.map((i) => (
              <div
                key={i.id}
                className={`card card-hover border-l-2 p-4 ${
                  i.severity === "HIGH"
                    ? "border-l-red-400/80"
                    : i.severity === "MEDIUM"
                      ? "border-l-orange-400/80"
                      : "border-l-cyan-400/60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${i.severity === "HIGH" ? "badge-red" : i.severity === "MEDIUM" ? "badge-orange" : "badge-low"}`}>
                    {i.severity}
                  </span>
                  <span className="badge-blue">{i.type}</span>
                  {i.impact_value != null && (
                    <span className="ms-auto font-semibold text-emerald-300">
                      ${Number(i.impact_value).toLocaleString()} {t("dash.atStake")}
                    </span>
                  )}
                </div>
                <div className="mt-2 font-semibold text-white">{i.title}</div>
                <p className="muted mt-1 line-clamp-2">{i.summary}</p>
                <div className="mt-3"><EvidenceDrawer insightId={i.id} /></div>
              </div>
            ))}
            {insights.length === 0 && (
              <div className="card p-6 text-center muted">{t("dash.noInsights")}</div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {/* Revenue signals — collected vs overdue meter */}
          <section className="card p-5">
            <h2 className="eyebrow mb-3 !text-emerald-300">{t("dash.revenueSignals")}</h2>
            <div className="flex items-baseline justify-between">
              <span className="muted text-sm">{t("dash.collected")}</span>
              <span className="font-semibold text-emerald-300">${collected.toLocaleString()}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                style={{ width: `${collectedPct}%` }}
              />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="muted text-sm">{t("dash.overdue")}</span>
              <span className="font-semibold text-orange-300">${overdue.toLocaleString()}</span>
            </div>
          </section>

          {/* Tasks */}
          <section className="card p-5">
            <h2 className="eyebrow mb-3 !text-orange-300">{t("dash.openTasks")}</h2>
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${task.priority === "HIGH" ? "bg-red-400" : "bg-cyan-400"}`} />
                  <div className="min-w-0">
                    <div className="truncate text-navy-100">{task.title}</div>
                    <div className="text-xs text-navy-300/70">{task.assignee ?? "—"} · {task.priority}</div>
                  </div>
                </li>
              ))}
              {tasks.length === 0 && <li className="muted">{t("dash.noTasks")}</li>}
            </ul>
          </section>

          {/* Activity */}
          <section className="card p-5">
            <h2 className="eyebrow mb-3 !text-violet-300">{t("dash.recentActivity")}</h2>
            <ul className="space-y-1.5 text-xs">
              {activity.map((a, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className={`mt-0.5 ${a.actor_type === "AI" ? "text-violet-300" : "text-cyan-300"}`}>
                    {a.actor_type === "AI" ? "✦" : a.actor_type === "SYSTEM" ? "⚙" : "•"}
                  </span>
                  <div className="min-w-0">
                    <span className="text-navy-100">{a.action.replaceAll("_", " ").toLowerCase()}</span>
                    {a.detail && <span className="text-navy-300"> — {a.detail}</span>}
                    <div className="text-navy-300/60">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
              {activity.length === 0 && <li className="muted">—</li>}
            </ul>
          </section>
        </aside>
      </div>

      {/* Poster-style tagline bar */}
      <div className="card p-4 text-center">
        <span className="eyebrow">
          {t("dash.cuePrepares")} <span className="text-violet-300">✦</span> {t("dash.clickable")}
        </span>
      </div>

    </div>
  );
}
