import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import Importer from "./Importer";

export const dynamic = "force-dynamic";

// CSV importer — where a real DMS/plate-list export becomes structured
// CUE records. Hangs off the intake checklist's third step; the mock
// exercise teaches the shape, this page does the real thing.
export default async function ImportPage() {
  await guardWorkspaceModule();
  await requireSession();
  const { t } = await getT();
  const s = await requireSession();
  const canImport = s.role !== "MEMBER";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Import records from a CSV</h1>
        <p className="page-sub">Drop an export from your DMS, CRM, or billing system, map the columns, check the preview, then commit.</p>
      </div>
      <Importer canImport={canImport} />
      <p className="muted text-xs">
        Every imported row is org-scoped and audited — {t("app.tagline")}
      </p>
    </div>
  );
}
