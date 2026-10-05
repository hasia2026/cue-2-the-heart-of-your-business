import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import CaptureClient from "./CaptureClient";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const docs = await sql`
    select d.id, d.title, d.kind, d.status, d.uploaded_at, d.size_bytes,
      (select count(*) from knowledge_items k where k.document_id = d.id)::int as knowledge_count
    from documents d where d.organization_id = ${orgId}
    order by d.uploaded_at desc limit 30`;
  const [stats] = await sql`
    select
      (select count(*) from documents where organization_id = ${orgId})::int as docs,
      (select count(*) from entities where organization_id = ${orgId})::int as entities,
      (select count(*) from facts where organization_id = ${orgId})::int as facts`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Capture</h1>
        <p className="page-sub">Bring information in. CUE classifies, extracts, organizes, connects, and makes it searchable.</p>
      </div>

      <CaptureClient />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Documents</div><div className="kpi mt-1">{stats?.docs ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Entities identified</div><div className="kpi mt-1">{stats?.entities ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Facts extracted</div><div className="kpi mt-1">{stats?.facts ?? 0}</div></div>
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-3">Captured items ({docs.length})</h2>
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm">
              <span className="badge-blue">{d.kind}</span>
              <span className="font-medium text-navy-100">{d.title}</span>
              <span className="text-xs text-navy-300/60">{new Date(d.uploaded_at).toLocaleDateString()} · {Math.max(1, Math.round(Number(d.size_bytes) / 1024))} KB</span>
              {Number(d.knowledge_count) > 0 && <span className="badge-green ms-auto">{d.knowledge_count} knowledge</span>}
            </div>
          ))}
          {docs.length === 0 && <p className="muted">Nothing captured yet — upload something above.</p>}
        </div>
      </section>
    </div>
  );
}
