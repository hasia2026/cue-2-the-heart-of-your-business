import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function EnhancePage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;

  const [counts] = await sql`
    select
      (select count(*)::int from service_plans where organization_id = ${orgId}) as plans,
      (select count(*)::int from service_offerings where organization_id = ${orgId}) as offerings,
      (select count(*)::int from brand_assets where organization_id = ${orgId}) as assets`;

  const csSignals = await sql`
    select summary, channel, direction, occurred_at, c.name as customer
    from communications co join customers c on c.id = co.customer_id
    where co.organization_id = ${orgId} order by co.occurred_at desc limit 6`;
  const processCands = await sql`
    select id, title, summary, severity, impact_value from insights
    where organization_id = ${orgId} and type in ('OPERATIONS','RISK') and status = 'OPEN'
    order by impact_value desc nulls last limit 6`;

  const tools = [
    {
      href: "/enhance/service-plans",
      label: t("nav.servicePlans"),
      description: "Build the offer ladder, share tracked sign-up links, and turn interested owners into active agreements.",
      count: `${Number(counts?.plans ?? 0)} plan${Number(counts?.plans ?? 0) === 1 ? "" : "s"}`,
      icon: "◫",
    },
    {
      href: "/enhance/pricing-studio",
      label: t("nav.pricingStudio"),
      description: "Work out the right price for jobs, vehicles, and products, then keep your service price book current.",
      count: `${Number(counts?.offerings ?? 0)} offering${Number(counts?.offerings ?? 0) === 1 ? "" : "s"}`,
      icon: "◈",
    },
    {
      href: "/enhance/brand-studio",
      label: t("nav.brandStudio"),
      description: "Keep the voice, visuals, and proof points that make the business feel consistent everywhere.",
      count: `${Number(counts?.assets ?? 0)} asset${Number(counts?.assets ?? 0) === 1 ? "" : "s"}`,
      icon: "✦",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("enhance.title")}</h1>
        <p className="page-sub">{t("enhance.subtitle")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="card group p-5 transition hover:border-violet-400/30 hover:bg-white/[0.05]"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-lg text-violet-200">
                {tool.icon}
              </span>
              <span className="badge-low ms-auto">{tool.count}</span>
            </div>
            <h2 className="mt-3 font-semibold text-white">{tool.label}</h2>
            <p className="muted mt-1 text-sm">{tool.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-300">
              Open {tool.label} <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="customer-signals" className="scroll-mt-24">
          <h2 className="section-title mb-3">Customer experience signals</h2>
          <div className="space-y-2">
            {csSignals.map((s, i) => (
              <div key={i} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-navy-100">{s.customer}</span>
                  <span className="badge-low">{s.channel}</span>
                  <span className="ms-auto text-xs text-navy-300/60">{new Date(s.occurred_at).toLocaleDateString()}</span>
                </div>
                <p className="muted mt-1 text-xs">{s.summary}</p>
              </div>
            ))}
            {csSignals.length === 0 && <div className="card p-5 muted">Log customer communications to see experience signals.</div>}
          </div>
        </section>

        <section id="process-candidates" className="scroll-mt-24">
          <h2 className="section-title mb-3">Process improvement candidates</h2>
          <div className="space-y-2">
            {processCands.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${p.severity === "HIGH" ? "badge-red" : "badge-orange"}`}>{p.severity}</span>
                  <span className="font-medium text-navy-100">{p.title}</span>
                  {p.impact_value != null && <span className="ms-auto text-sm text-cue-green">${Number(p.impact_value).toLocaleString()}</span>}
                </div>
                <p className="muted mt-1 text-xs">{p.summary}</p>
              </div>
            ))}
            {processCands.length === 0 && <div className="card p-5 muted">No open operational insights — processes look clean.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
