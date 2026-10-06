import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { PRICING_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import PricingStudio from "./PricingStudio";

export const dynamic = "force-dynamic";

export default async function EnhancePage() {
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;
  const [profile] = await sql`select industry from business_profiles where organization_id = ${orgId}`;
  const vehRows = await sql`
    select id, stock_number, year, make, model, trim,
      coalesce(cost, 0)::float as cost, coalesce(list_price, 0)::float as list_price,
      extract(epoch from (now() - listed_at)) / 86400 as days
    from vehicles
    where organization_id = ${orgId} and status = 'AVAILABLE' and listed_at is not null
    order by listed_at asc limit 12`;
  const vehicles = vehRows.map((v) => ({
    id: v.id as string,
    label: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") + ` (${v.stock_number})`,
    cost: Number(v.cost) || 0,
    days: Math.max(0, Math.round(Number(v.days))),
    listPrice: Number(v.list_price) || 0,
  }));

  const assets = await sql`
    select id, name, kind, description, status from brand_assets
    where organization_id = ${orgId} order by kind, name`;
  const csSignals = await sql`
    select summary, channel, direction, occurred_at, c.name as customer
    from communications co join customers c on c.id = co.customer_id
    where co.organization_id = ${orgId} order by co.occurred_at desc limit 6`;
  const processCands = await sql`
    select id, title, summary, severity, impact_value from insights
    where organization_id = ${orgId} and type in ('OPERATIONS','RISK') and status = 'OPEN'
    order by impact_value desc nulls last limit 6`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("enhance.title")}</h1>
        <p className="page-sub">{t("enhance.subtitle")}</p>
      </div>

      <PricingStudio
        industry={(profile?.industry as string) ?? ""}
        vehicles={vehicles}
        labels={buildLabels(PRICING_LABEL_KEYS, t)}
      />

      <section>
        <h2 className="section-title mb-3">Brand Studio</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {assets.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{a.name}</span>
                <span className="badge-blue ms-auto">{a.kind}</span>
              </div>
              {a.description && <p className="muted mt-1 text-xs">{a.description}</p>}
            </div>
          ))}
          {assets.length === 0 && <div className="card p-5 muted">No brand assets yet.</div>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="section-title mb-3">Customer experience signals</h2>
          <div className="space-y-2">
            {csSignals.map((s, i) => (
              <div key={i} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-navy-100">{s.customer}</span>
                  <span className="badge-low">{s.channel}</span>
                  <span className="text-xs text-navy-300/60 ms-auto">{new Date(s.occurred_at).toLocaleDateString()}</span>
                </div>
                <p className="muted mt-1 text-xs">{s.summary}</p>
              </div>
            ))}
            {csSignals.length === 0 && <div className="card p-5 muted">Log customer communications to see experience signals.</div>}
          </div>
        </section>

        <section>
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
