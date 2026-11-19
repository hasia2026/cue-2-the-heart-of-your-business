import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { PRICING_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import PricingStudio from "../PricingStudio";
import PriceBookClient from "../PriceBookClient";

export const dynamic = "force-dynamic";

export default async function PricingStudioPage() {
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

  return (
    <div className="space-y-5">
      <div>
        <Link href="/enhance" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Enhance</Link>
        <h1 className="page-title mt-2">Pricing Studio</h1>
        <p className="page-sub">Work out the right price for jobs, vehicles, and products, then keep your service price book current.</p>
      </div>

      <PricingStudio
        industry={(profile?.industry as string) ?? ""}
        vehicles={vehicles}
        labels={buildLabels(PRICING_LABEL_KEYS, t)}
      />

      <PriceBookClient offerings={offerings} assemblies={assemblies} canEdit={session.role !== "MEMBER"} />
    </div>
  );
}
