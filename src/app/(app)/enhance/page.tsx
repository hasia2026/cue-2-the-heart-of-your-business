import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { PRICING_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import PricingStudio from "./PricingStudio";
import PriceBookClient from "./PriceBookClient";

export const dynamic = "force-dynamic";

export default async function EnhancePage() {
  await guardWorkspaceModule();
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

  // Service price book — offerings with dual labor rates + assemblies of
  // pre-built lines. Tables are created by migrate-pricebook.sql; empty is
  // fine, the client renders empty states for orgs that haven't used it yet.
  const offeringRows = await sql`
    select id, name, description, parts_cost as "partsCost",
      labor_rate_standalone as "rateStandalone", labor_rate_addon as "rateAddon",
      labor_hours as "laborHours"
    from service_offerings where organization_id = ${orgId} order by name`;
  const assemblyRows = await sql`
    select a.id, a.name, a.description,
      json_agg(json_build_object('offeringId', i.offering_id, 'name', o.name, 'mode', i.pricing_mode)
        order by i.position) as lines
    from service_assemblies a
    left join service_assembly_items i on i.assembly_id = a.id
    left join service_offerings o on o.id = i.offering_id
    where a.organization_id = ${orgId}
    group by a.id, a.name, a.description
    order by a.name`;
  const offerings = offeringRows.map((o) => ({
    id: String(o.id), name: String(o.name), description: o.description ? String(o.description) : null,
    partsCost: Number(o.partsCost) || 0, rateStandalone: Number(o.rateStandalone) || 0,
    rateAddon: Number(o.rateAddon) || 0, laborHours: Number(o.laborHours) || 0,
  }));
  const assemblies = assemblyRows.map((a) => {
    type Line = { offeringId: string; name: string; mode: "STANDALONE" | "ADDON" };
    const raw = Array.isArray(a.lines) ? (a.lines as unknown[]) : [];
    const lines: Line[] = raw
      .filter((l): l is Line => Boolean(l) && typeof l === "object" && "offeringId" in (l as object))
      .map((l) => ({ offeringId: String((l as Line).offeringId), name: String((l as Line).name), mode: (l as Line).mode === "ADDON" ? "ADDON" : "STANDALONE" }));
    return { id: String(a.id), name: String(a.name), description: a.description ? String(a.description) : null, lines };
  });
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

      <PriceBookClient offerings={offerings} assemblies={assemblies} canEdit={session.role !== "MEMBER"} />

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
