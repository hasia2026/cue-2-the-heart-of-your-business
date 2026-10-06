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
  const [atStake] = await sql`
    select coalesce(sum(impact_value),0)::float as total
    from insights where organization_id = ${orgId} and status = 'OPEN'`;
  const activity = await sql`
    select action, actor_type, detail, created_at from audit_events
    where organization_id = ${orgId} order by created_at desc limit 4`;
  const topTasks = await sql`
    select t.id, t.title, t.priority, e.name as assignee
    from tasks t left join employees e on e.id = t.assignee_id
    where t.organization_id = ${orgId} and t.status in ('OPEN','IN_PROGRESS')
    order by case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end limit 3`;

  const collected = Math.round(revenue?.collected ?? 0);
  const overdue = Math.round(revenue?.overdue ?? 0);
  const stake = Math.round(atStake?.total ?? 0);
  const fmt = (n: number) => "$" + n.toLocaleString();
  const gradeBadge =
    health.grade === "HEALTHY" ? "badge-green" : health.grade === "WATCH" ? "badge-orange" : "badge-red";
  const healthCaption =
    health.grade === "HEALTHY" ? t("dash.healthOk") : health.grade === "WATCH" ? t("dash.healthWatch") : t("dash.healthCritical");

  const priority = insights[0];
  const rest = insights.slice(1);
  const strip = [
    { label: t("dash.openInsights"), value: String(insights.length), cap: t("dash.tileInsightsCap").replace("{x}", fmt(stake)), dot: "text-cyan-300", icon: "◈" },
    { label: t("dash.pendingDecisions"), value: String(pending?.n ?? 0), cap: t("dash.cuePrepares"), dot: "text-fuchsia-300", icon: "✦" },
    { label: t("dash.openTasks"), value: String(openTasks?.n ?? 0), cap: t("dash.fromWorkflows"), dot: "text-violet-300", icon: "▶" },
    { label: t("dash.collected"), value: fmt(collected), cap: t("dash.revenueSignals"), dot: "text-emerald-300", icon: "$" },
  ];
  const healthStroke = health.grade === "HEALTHY" ? "#34d399" : health.grade === "WATCH" ? "#fbbf24" : "#f87171";

  return (
    <div className="space-y-4">
      {/* Top tagline — poster header line */}
      <div className="text-center">
        <span className="text-lg font-semibold text-white md:text-xl">{t("dash.taglineTop")}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Left rail: brand + value pillars (mock's left column) ── */}
        <aside className="space-y-4">
          <div className="card flex items-center gap-3 p-4">
            <LogoMark className="h-9 w-9" />
            <div>
              <div className="text-lg font-bold tracking-wide text-white">CUE</div>
              <div className="text-[11px] text-violet-300">{t("app.tagline")}</div>
            </div>
          </div>
          <div className="card space-y-4 p-5">
            {[
              { icon: "✦", color: "text-violet-300", ring: "border-violet-400/50", title: t("nav.understand"), desc: t("home.understandDesc") },
              { icon: "◎", color: "text-cyan-300", ring: "border-cyan-400/50", title: t("nav.execute"), desc: t("home.executeDesc") },
              { icon: "⚡", color: "text-emerald-300", ring: "border-emerald-400/50", title: t("nav.enhance"), desc: t("home.enhanceDesc") },
              { icon: "▤", color: "text-orange-300", ring: "border-orange-400/50", title: t("nav.expand"), desc: t("home.expandDesc") },
            ].map((p) => (
              <div key={p.title} className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${p.ring} bg-white/[0.03] text-lg ${p.color}`}>{p.icon}</span>
                <div>
                  <div className={`font-semibold ${p.color}`}>{p.title}</div>
                  <p className="muted text-xs leading-snug">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main panel (mock's right column) ── */}
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Priority insight */}
            {priority ? (
              <div className="card card-hover relative overflow-hidden p-5 lg:col-span-1">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl" />
                <div className="flex items-center justify-between">
                  <span className="eyebrow !text-cyan-300">{t("dash.priorityInsight")}</span>
                  <span className="text-violet-300">✦</span>
                </div>
                <div className="mt-3 text-lg font-semibold leading-snug text-white">{priority.title}</div>
                {priority.impact_value != null && (
                  <div className="mt-1 text-2xl font-bold text-cyan-300">{fmt(Number(priority.impact_value))}</div>
                )}
                <p className="muted mt-2 line-clamp-3 text-sm">{priority.summary}</p>
                <div className="mt-4"><EvidenceDrawer insightId={priority.id} /></div>
              </div>
            ) : (
              <div className="card p-5">
                <span className="eyebrow !text-cyan-300">{t("dash.priorityInsight")}</span>
                <p className="muted mt-6 text-sm">{t("dash.noInsights")}</p>
              </div>
            )}

            {/* Emblem center */}
            <div className="card relative hidden items-center justify-center overflow-hidden p-5 lg:flex">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.22),transparent_65%)]" />
              <div className="cue-halo relative">
                <LogoMark className="h-28 w-28" />
              </div>
            </div>

            {/* Business health ring */}
            <div className="card flex flex-col items-center justify-center p-5 text-center">
              <div className="relative h-40 w-40">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke={healthStroke} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(health.overall / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="kpi !text-4xl">{health.overall}</span>
                  <span className={`badge mt-1 ${gradeBadge}`}>{health.grade.replace("_", " ")}</span>
                </div>
              </div>
              <p className="muted mt-3 text-xs">{healthCaption}</p>
              <a href="/compass" className="btn-primary mt-3 !px-4 !py-1.5 text-xs">{t("dash.viewHealthReport")}</a>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {strip.map((s) => (
              <div key={s.label} className="card p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-navy-300">
                  <span className={`text-base ${s.dot}`}>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="kpi mt-2 !text-3xl">{s.value}</div>
                <div className="muted mt-1 truncate text-[11px]">{s.cap}</div>
              </div>
            ))}
          </div>

          {/* Bottom band: activity + recommended next actions */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="eyebrow mb-3">{t("dash.recentActivity")}</h2>
              <ul className="space-y-2.5">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${a.actor_type === "AI" ? "bg-violet-500/15 text-violet-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                      {a.actor_type === "AI" ? "✦" : "✓"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-navy-100">
                      {a.action.replaceAll("_", " ").toLowerCase()}{a.detail ? ` — ${a.detail}` : ""}
                    </span>
                    <span className="muted shrink-0 text-xs">{new Date(a.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
                {activity.length === 0 && <li className="muted">—</li>}
              </ul>
            </section>

            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="eyebrow !text-violet-300">{t("dash.recommendedActions")}</h2>
                <a href="/execute" className="text-xs text-cyan-300 hover:underline">{t("dash.viewAll")}</a>
              </div>
              <ul className="space-y-2.5">
                {topTasks.map((task, i) => (
                  <li key={task.id} className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-navy-100">{task.title}</span>
                    <span className="badge-low shrink-0">{task.priority}</span>
                  </li>
                ))}
                {topTasks.length === 0 && (
                  <li className="muted text-sm">
                    {pending?.n > 0
                      ? `${pending.n} × ${t("dash.pendingDecisions")} → `
                      : t("dash.noTasks")}
                    {!pending?.n && <a href="/understand" className="text-cyan-300 hover:underline">Understand</a>}
                  </li>
                )}
              </ul>
            </section>
          </div>

          {/* Secondary insights below the fold of the mock */}
          {rest.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {rest.map((i) => (
                <div key={i.id} className={`card card-hover border-l-2 p-4 ${i.severity === "HIGH" ? "border-l-red-400/80" : i.severity === "MEDIUM" ? "border-l-orange-400/80" : "border-l-cyan-400/60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${i.severity === "HIGH" ? "badge-red" : i.severity === "MEDIUM" ? "badge-orange" : "badge-low"}`}>{i.severity}</span>
                    <span className="badge-blue">{i.type}</span>
                    {i.impact_value != null && <span className="ms-auto text-xs font-semibold text-emerald-300">{fmt(Number(i.impact_value))} {t("dash.atStake")}</span>}
                  </div>
                  <div className="mt-2 font-semibold text-white">{i.title}</div>
                  <p className="muted mt-1 line-clamp-2 text-sm">{i.summary}</p>
                  <div className="mt-3"><EvidenceDrawer insightId={i.id} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
