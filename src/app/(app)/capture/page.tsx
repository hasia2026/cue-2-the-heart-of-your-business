import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { FOLDER_FOR_KIND } from "@/lib/capture-classify";
import CaptureClient from "./CaptureClient";
import DocumentRow from "./DocumentRow";

export const dynamic = "force-dynamic";

const KIND_ICONS: Record<string, string> = {
  AI_CHAT: "🤖", POLICY: "📘", PROCEDURE: "📋", CONTRACT: "✍️",
  RECORD: "🧾", SPREADSHEET: "📊", MEDIA: "🖼️", OTHER: "📄",
};

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
  const folderRows = await sql`
    select coalesce(dp.name, 'Unfiled') as folder, count(*)::int as n
    from documents d left join departments dp on dp.id = d.department_id
    where d.organization_id = ${orgId}
    group by coalesce(dp.name, 'Unfiled') order by n desc`;
  const countsByFolder = new Map(folderRows.map((r) => [String(r.folder), Number(r.n)]));
  // Ordered folder list: the auto folders in fixed order, then custom ones, then Unfiled.
  const autoFolders = Object.values(FOLDER_FOR_KIND);
  const folderNames = [
    ...autoFolders.filter((f) => countsByFolder.has(f)),
    ...[...countsByFolder.keys()].filter((f) => f !== "Unfiled" && !autoFolders.includes(f)),
    ...[...countsByFolder.keys()].filter((f) => f === "Unfiled"),
  ];
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

      {/* Auto-organizing folders — like a Drive sidebar. Docs are filed here
          automatically by CUE (kind → folder); move manually re-files. */}
      <section className="card p-5">
        <h2 className="section-title mb-3">Folders (auto-organized)</h2>
        <div className="flex flex-wrap gap-2">
          {folderNames.map((name) => (
            <div key={name} className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-sm">
              <span>📁</span>
              <span className="font-medium text-navy-100">{name}</span>
              <span className="badge-low">{countsByFolder.get(name)}</span>
            </div>
          ))}
          {folderNames.length === 0 && <p className="muted">No folders yet — first capture creates one automatically.</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-navy-300/60">
          {Object.entries(KIND_ICONS).map(([kind, icon]) => (
            <span key={kind}>{icon} {FOLDER_FOR_KIND[kind] ? kind : null}</span>
          ))}
        </div>
      </section>

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
