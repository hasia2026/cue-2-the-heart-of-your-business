import { sql } from "@/lib/db";
import type { PendingQuery } from "postgres";
import { computeHealth } from "@/lib/health";
import { getT } from "@/lib/locale";
import { getVocab } from "@/lib/vocab";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import EvidenceDrawer from "@/components/EvidenceDrawer";

export const dynamic = "force-dynamic";

// Owner dashboard period switcher: the chips set ?range= and every tile below
// recomputes inside that window. Each window is a SQL fragment, so the six-tile
// aggregate below stays one query regardless of selection.
const RANGES: { key: string; label: string; when: PendingQuery<readonly (object | undefined)[]> }[] = [
  { key: "30d", label: "30 Days", when: sql`now() - interval '30 days'` },
  { key: "today", label: "Today", when: sql`date_trunc('day', now())` },
  { key: "week", label: "This Week", when: sql`date_trunc('week', now())` },
  { key: "month", label: "This Month", when: sql`date_trunc('month', now())` },
  { key: "quarter", label: "Quarter", when: sql`date_trunc('quarter', now())` },
  { key: "ytd", label: "YTD", when: sql`date_trunc('year', now())` },
];
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [session] = await Promise.all([import("@/lib/auth").then((m) => m.requireSession())]);
  const orgId = session.organizationId;
  const { t } = await getT();
  const sp = await searchParams;
  const vocab = await getVocab(orgId);
  // Workspace Studio guided setup — checklist ticks derive from live profile state.
  const ws = await getWorkspaceProfile(orgId);
  const setupSteps = [
    { id: "persona" as const, label: "Name your AI Ambassador", href: "/onboarding" },
    { id: "branding" as const, label: "Brand your quotes & emails", href: "/onboarding" },
    { id: "modules" as const, label: "Tune your sidebar", href: "/onboarding" },
  ];
  const pendingSetup = setupSteps.filter((s) => !ws.setupCompleted[s.id]);
  const showSetupCard = Boolean(pendingSetup.length) && session.role !== "MEMBER";
  const health = await computeHealth(orgId);

  // Period switcher (KPI tiles): validated ?range=, defaults to the rolling 30
  // days so a brand-new org never opens on empty tiles.
  const rangeKey = RANGES.some((r) => r.key === sp?.range) ? sp.range! : "30d";
  const range = RANGES.find((r) => r.key === rangeKey)!;
  // Six-tile KPI strip, computed from live records in the selected window only.
  const [agg] = await sql`
    select
      (select count(*)::int from service_orders where organization_id = ${orgId} and opened_at >= ${range.when}) as jobs_booked,
      (select coalesce(sum(amount),0)::float from service_orders where organization_id = ${orgId} and opened_at >= ${range.when}) as booked_dollars,
      (select count(*)::int from service_orders where organization_id = ${orgId} and completed_at >= ${range.when}) as jobs_completed,
      (select coalesce(sum(amount),0)::float from service_orders where organization_id = ${orgId} and completed_at >= ${range.when}) as completed_dollars,
      (select count(*)::int from leads where organization_id = ${orgId} and created_at >= ${range.when}) as new_leads,
      (select count(*)::int from leads where organization_id = ${orgId} and created_at >= ${range.when} and status = 'LOST') as lost_leads,
      (select coalesce(sum(est_value),0)::float from leads where organization_id = ${orgId} and created_at >= ${range.when} and status = 'LOST') as lost_value,
      (select coalesce(sum(amount),0)::float from payments where organization_id = ${orgId} and received_at >= ${range.when}) as collected,
      (select count(*)::int from payments where organization_id = ${orgId} and received_at >= ${range.when}) as payments_n,
      (select count(*)::int from invoices where organization_id = ${orgId} and issued_at >= ${range.when} and status = 'OVERDUE') as overdue_n,
      (select coalesce(sum(amount),0)::float from invoices where organization_id = ${orgId} and issued_at >= ${range.when} and status = 'OVERDUE') as overdue_amount
  `;

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

  // Scorecard status inputs: high-severity exposure and task aging.
  const [highOpen] = await sql`
    select count(*)::int as n from insights
    where organization_id = ${orgId} and status = 'OPEN' and severity = 'HIGH'`;
  const [agingTasks] = await sql`
    select count(*)::int as n from tasks
    where organization_id = ${orgId} and status in ('OPEN','IN_PROGRESS')
      and created_at < now() - interval '7 days'`;
  const [overdueInv] = await sql`
    select count(*)::int as n from invoices
    where organization_id = ${orgId} and status = 'OVERDUE'`;

  const collected = Math.round(revenue?.collected ?? 0);
  const overdue = Math.round(revenue?.overdue ?? 0);
  const stake = Math.round(atStake?.total ?? 0);
  const fmt = (n: number) => "$" + n.toLocaleString();

  // KPI tile strip (the reference design's language: color-tinted tiles, one
  // giant number, one sub-metric) — driven by the period switcher above.
  const bookedAvg = (agg?.booked_dollars ?? 0) / Math.max(agg?.jobs_booked ?? 0, 1);
  const completedAvg = (agg?.completed_dollars ?? 0) / Math.max(agg?.jobs_completed ?? 0, 1);
  const kpiTiles = [
    { label: "Jobs booked", icon: "▤", tint: "cyan", value: String(agg?.jobs_booked ?? 0), sub: `${fmt(Math.round(agg?.booked_dollars ?? 0))} booked`, note: `avg ${fmt(Math.round(bookedAvg))} / job` },
    { label: "Jobs completed", icon: "✔", tint: "emerald", value: String(agg?.jobs_completed ?? 0), sub: `${fmt(Math.round(agg?.completed_dollars ?? 0))} closed`, note: `avg ${fmt(Math.round(completedAvg))} / job` },
    { label: "New leads", icon: "◈", tint: "violet", value: String(agg?.new_leads ?? 0), sub: "captured by CUE" },
    { label: "Cash collected", icon: "$", tint: "sky", value: fmt(Math.round(agg?.collected ?? 0)), sub: `${agg?.payments_n ?? 0} payments` },
    { label: "Lost leads", icon: "✕", tint: "red", value: String(agg?.lost_leads ?? 0), sub: `${fmt(Math.round(agg?.lost_value ?? 0))} walked away` },
    { label: "Overdue invoices", icon: "⚠", tint: "amber", value: String(agg?.overdue_n ?? 0), sub: `${fmt(Math.round(agg?.overdue_amount ?? 0))} uncollected` },
  ];
  const TINT: Record<string, { text: string; glow: string }> = {
    cyan: { text: "text-cyan-300", glow: "bg-cyan-500/10" },
    emerald: { text: "text-emerald-300", glow: "bg-emerald-500/10" },
    violet: { text: "text-violet-300", glow: "bg-violet-500/10" },
    sky: { text: "text-sky-300", glow: "bg-sky-500/10" },
    red: { text: "text-red-300", glow: "bg-red-500/10" },
    amber: { text: "text-amber-300", glow: "bg-amber-500/10" },
  };
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

  // Live scorecard — leading indicators with status chips, all from the same
  // live tables. Thresholds are deliberately simple and stable so an owner can
  // predict a chip flip without recalculating it.
  type Chip = { label: "ON TRACK" | "ATTENTION" | "AT RISK"; cls: string };
  const ok: Chip = { label: "ON TRACK", cls: "badge-green" };
  const watch: Chip = { label: "ATTENTION", cls: "badge-orange" };
  const risk: Chip = { label: "AT RISK", cls: "badge-red" };
  const scorecard: { label: string; value: string; chip: Chip }[] = [
    { label: "Open revenue leaks", value: `${insights.length} · ${fmt(stake)}`, chip: highOpen?.n ? risk : insights.length ? watch : ok },
    { label: "Decisions awaiting approval", value: String(pending?.n ?? 0), chip: (pending?.n ?? 0) > 5 ? watch : ok },
    { label: "Tasks aging past 7 days", value: String(agingTasks?.n ?? 0), chip: (agingTasks?.n ?? 0) > 0 ? watch : ok },
    { label: "Overdue AR invoices", value: `${overdueInv?.n ?? 0} · ${fmt(overdue)}`, chip: overdue > 0 || (overdueInv?.n ?? 0) > 0 ? risk : ok },
    { label: "Collected this org", value: fmt(collected), chip: collected > 0 ? ok : watch },
  ];

  return (
    <div className="space-y-4">
      {/* Workspace Studio setup checklist — dismiss-free (state-derived), links to the wizard */}
      {showSetupCard && (
        <section className="card card-hover border-l-2 border-l-violet-400/70 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow !text-violet-300">Set up your workspace</span>
            <span className="muted text-xs">{pendingSetup.length} step{pendingSetup.length === 1 ? "" : "s"} left — optional, skip anytime</span>
            <a href="/onboarding" className="btn-primary ms-auto !px-3 !py-1.5 text-xs">Continue setup →</a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {setupSteps.map((s) => (
              <span key={s.id} className={`badge ${ws.setupCompleted[s.id] ? "badge-green" : "badge-low"}`}>
                {ws.setupCompleted[s.id] ? "✓" : "○"} {s.label}
              </span>
            ))}
          </div>
        </section>
      )}
      {/* Top tagline — poster header line */}
      <div className="text-center">
        <span className="text-lg font-semibold text-white md:text-xl">{t("dash.taglineTop")}</span>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-navy-300">{vocab.dashPack}</div>
      </div>

      {/* KPI strip + period switcher — the owner's first read, then the loops */}
      <section className="card min-w-0 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <a
              key={r.key}
              href={`/dashboard?range=${r.key}`}
              aria-current={r.key === rangeKey ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${r.key === rangeKey ? "bg-violet-500/25 font-semibold text-violet-100 ring-1 ring-violet-400/50" : "text-navy-300 hover:bg-white/5 hover:text-white"}`}
            >
              {r.label}
            </a>
          ))}
          <span className="ms-auto muted text-xs">tiles reflect the selected window · scorecard below is all-time</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {kpiTiles.map((s) => {
            const tint = TINT[s.tint];
            return (
              <div key={s.label} className="card relative min-w-0 overflow-hidden p-3.5">
                <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full ${tint.glow} blur-2xl`} />
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-navy-300">
                  <span aria-hidden className={`text-sm ${tint.text}`}>{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="kpi mt-1.5 !text-3xl">{s.value}</div>
                <div className="muted mt-1 truncate text-[11px]">{s.sub}</div>
                {s.note && <div className={`truncate text-[11px] ${tint.text}`}>{s.note}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* COMMAND CENTER — the recommended next action leads the page */}
      <section className="card relative min-w-0 overflow-hidden border-l-2 border-l-violet-400/80 p-5">
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="eyebrow !text-violet-300">{t("dash.recommendedActions")}</span>
            <div className="muted mt-0.5">{t("dash.title")}</div>
          </div>
          <a href="/execute" className="text-xs text-cyan-300 hover:underline">{t("dash.viewAll")} →</a>
        </div>
        <ul className="space-y-2.5">
          {topTasks.map((task, i) => (
            <li key={task.id} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">{i + 1}</span>
              <a href="/execute" className="min-w-0 flex-1 truncate text-navy-100 hover:text-white hover:underline">{task.title}</a>
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

      {/* Essentials only — priority insight, health, numbers, actions. No side rail, no filler tiles. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

          {/* Live scorecard — leading indicators with status chips */}
          <section className="card min-w-0 p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="eyebrow">Scorecard</h2>
              <a href="/report" className="text-xs text-cyan-300 hover:underline">Full report →</a>
            </div>
            <div className="space-y-2">
              {scorecard.map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-navy-100">{row.label}</span>
                  <span className="muted shrink-0 font-semibold">{row.value}</span>
                  <span className={`badge shrink-0 ${row.chip.cls}`}>{row.chip.label}</span>
                </div>
              ))}
            </div>
            <p className="muted mt-3 text-[11px]">Computed from live records — chips flip on stable thresholds (any HIGH leak, overdue AR, tasks older than 7 days, &gt;5 pending decisions).</p>
          </section>

          {/* Bottom band: activity */}
          <section className="card min-w-0 p-5">
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
  );
}
