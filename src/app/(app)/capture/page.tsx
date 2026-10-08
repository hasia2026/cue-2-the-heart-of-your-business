import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import CaptureClient from "./CaptureClient";
import DocumentRow from "./DocumentRow";

export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;
  const docs = await sql`
    select d.id, d.title, d.kind, d.status, d.uploaded_at, d.size_bytes, d.extracted_text,
      d.department_id, d.share_token is not null as has_share,
      (select count(*) from knowledge_items k where k.document_id = d.id)::int as knowledge_count,
      (select name from departments dp where dp.id = d.department_id) as department_name
    from documents d where d.organization_id = ${orgId}
    order by d.uploaded_at desc limit 30`;
  const departments = await sql`select id, name from departments where organization_id = ${orgId} order by name`;
  const [stats] = await sql`
    select
      (select count(*) from documents where organization_id = ${orgId})::int as docs,
      (select count(*) from entities where organization_id = ${orgId})::int as entities,
      (select count(*) from facts where organization_id = ${orgId})::int as facts`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("capture.title")}</h1>
        <p className="page-sub">{t("capture.subtitle")}</p>
      </div>

      <CaptureClient />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">{t("capture.docs")}</div><div className="kpi mt-1">{stats?.docs ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">{t("capture.entities")}</div><div className="kpi mt-1">{stats?.entities ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">{t("capture.facts")}</div><div className="kpi mt-1">{stats?.facts ?? 0}</div></div>
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-3">{t("capture.capturedHead")} ({docs.length})</h2>
        <div className="space-y-2">
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={{
                id: d.id, title: d.title, kind: d.kind, status: d.status,
                uploaded_at: String(d.uploaded_at), size_bytes: Number(d.size_bytes),
                knowledge_count: Number(d.knowledge_count), extracted_text: d.extracted_text,
              }}
              canManage={session.role !== "MEMBER"}
              departments={departments.map((dp) => ({ id: dp.id, name: dp.name }))}
              currentDept={d.department_name ?? null}
              hasShare={Boolean(d.has_share)}
            />
          ))}
          {docs.length === 0 && <p className="muted">{t("capture.empty")}</p>}
        </div>
      </section>
    </div>
  );
}
