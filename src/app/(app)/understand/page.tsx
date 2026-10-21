import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { refreshIntelligenceAction } from "@/app/signin/actions";
import EvidenceDrawer from "@/components/EvidenceDrawer";

export const dynamic = "force-dynamic";

export default async function UnderstandPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const insights = await sql`
    select id, title, summary, severity, type, impact_value, status, confidence, created_at
    from insights where organization_id = ${orgId}
    order by case status when 'OPEN' then 0 else 1 end,
      case severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end,
      impact_value desc nulls last limit 20`;

  const [counts] = await sql`
    select
      (select count(*) from entities where organization_id = ${orgId})::int as entities,
      (select count(*) from facts where organization_id = ${orgId})::int as facts,
      (select count(*) from knowledge_items where organization_id = ${orgId})::int as knowledge,
      (select count(*) from insights where organization_id = ${orgId} and status='OPEN')::int as open`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="me-auto">
          <h1 className="page-title">Understand</h1>
          <p className="page-sub">Intelligence computed from your actual records — every claim carries evidence.</p>
        </div>
        <form action={async () => {
          "use server";
          await refreshIntelligenceAction();
        }}>
          <button className="btn-primary">⟳ Refresh intelligence</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Open insights</div><div className="kpi mt-1">{counts?.open ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Entities</div><div className="kpi mt-1">{counts?.entities ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Facts</div><div className="kpi mt-1">{counts?.facts ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Knowledge items</div><div className="kpi mt-1">{counts?.knowledge ?? 0}</div></div>
      </div>

      <section>
        <h2 className="section-title mb-3">Insight board</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((i) => (
            <div key={i.id} className={`card p-5 ${i.status !== "OPEN" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${i.severity === "HIGH" ? "badge-red" : i.severity === "MEDIUM" ? "badge-orange" : "badge-low"}`}>{i.severity}</span>
                <span className="badge-blue">{i.type}</span>
                {i.status !== "OPEN" && <span className="badge-purple">{i.status.replace("_", " ")}</span>}
                {i.impact_value != null && <span className="ms-auto font-semibold text-cue-green">${Number(i.impact_value).toLocaleString()}</span>}
              </div>
              <div className="mt-2 font-semibold text-white">{i.title}</div>
              <p className="muted mt-1">{i.summary}</p>
              <div className="mt-2 text-xs text-navy-300/70">Confidence {Math.round(Number(i.confidence) * 100)}% · detected {new Date(i.created_at).toLocaleDateString()}</div>
              <div className="mt-3"><EvidenceDrawer insightId={i.id} /></div>
            </div>
          ))}
          {insights.length === 0 && (
            <div className="card p-6 muted">No insights yet. Capture data or refresh intelligence.</div>
          )}
        </div>
      </section>
    </div>
  );
}
