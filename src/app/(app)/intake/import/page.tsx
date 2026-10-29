import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { getVocab } from "@/lib/vocab";
import { sql } from "@/lib/db";
import { KIND_LABELS } from "@/lib/csv";
import Importer from "./Importer";
import ExportBtn from "./ExportBtn";
import type { ImportHistoryRow } from "./actions";

export const dynamic = "force-dynamic";

// CSV importer — where a real DMS/plate-list/work-order export becomes
// structured CUE records. Hangs off the intake checklist's third step; the mock
// exercise teaches the shape, this page does the real thing. Industry pack
// picks which targets lead; ?kind= deep-links a specific target (Capture's
// import guide sends people here with the right one preselected).
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await guardWorkspaceModule();
  await requireSession();
  const { t } = await getT();
  const s = await requireSession();
  const canImport = s.role !== "MEMBER";
  const { kind: kindParam } = await searchParams;
  const vocab = await getVocab(s.organizationId);
  const initialKind = (
    ["CUSTOMERS", "VEHICLES", "INVOICES", "SERVICE_ORDERS", "AGREEMENTS"] as const
  ).find((k) => k.toLowerCase() === kindParam?.toLowerCase()) ?? null;

  // Import history — one row per committed file, so an owner can see what
  // entered CUE and reconcile it against the source export.
  const history: ImportHistoryRow[] =
    canImport
      ? ((await sql`
          select id, kind, file_name, actor_name, row_count, imported, skipped, customers_created, excluded_user, created_at
          from import_history where organization_id = ${s.organizationId}
          order by created_at desc limit 12`) as unknown as ImportHistoryRow[])
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Import records from a CSV</h1>
        <p className="page-sub">Drop an export from your DMS, office software, or billing system, map the columns, check the preview, then commit.</p>
      </div>
      <Importer canImport={canImport} pack={vocab.pack} initialKind={initialKind} />
      {history.length > 0 && (
          <section className="rounded-xl border border-white/[0.06] p-4">
          <h2 className="text-sm font-medium text-navy-100">Recent imports</h2>
          <p className="muted mb-3 text-xs">Every committed file, its counts, and who ran it. ↓ CSV downloads the same kind of records back out — diff it against your original export to reconcile.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="muted uppercase tracking-widest">
                <tr>
                  <th className="py-2 pe-3 font-medium">When</th>
                  <th className="py-2 pe-3 font-medium">File</th>
                  <th className="py-2 pe-3 font-medium">Target</th>
                  <th className="py-2 pe-3 font-medium">Rows</th>
                  <th className="py-2 pe-3 font-medium">Imported</th>
                  <th className="py-2 pe-3 font-medium">Skipped</th>
                  <th className="py-2 pe-3 font-medium">By</th>
                  <th className="py-2 pe-3 font-medium">Export</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-white/[0.05]">
                    <td className="py-2 pe-3 whitespace-nowrap text-navy-100">{new Date(h.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="py-2 pe-3 max-w-[180px] truncate text-navy-100" title={h.file_name}>{h.file_name}</td>
                    <td className="muted py-2 pe-3 whitespace-nowrap">{KIND_LABELS[h.kind as keyof typeof KIND_LABELS] ?? h.kind.toLowerCase()}</td>
                    <td className="muted py-2 pe-3">{h.row_count}</td>
                    <td className="py-2 pe-3 text-emerald-300">{h.imported}</td>
                    <td className="muted py-2 pe-3">
                      {h.skipped + h.excluded_user || "—"}
                    </td>
                    <td className="muted max-w-[140px] truncate py-2 pe-3" title={h.actor_name ?? undefined}>{h.actor_name ?? "—"}</td>
                    <td className="py-2 pe-3">
                      <ExportBtn kind={h.kind} label="↓ CSV" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="muted text-xs">
        Every imported row is org-scoped and audited — {t("app.tagline")}
      </p>
    </div>
  );
}
