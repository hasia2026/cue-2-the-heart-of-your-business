import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { getVocab } from "@/lib/vocab";
import Importer from "./Importer";

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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Import records from a CSV</h1>
        <p className="page-sub">Drop an export from your DMS, office software, or billing system, map the columns, check the preview, then commit.</p>
      </div>
      <Importer canImport={canImport} pack={vocab.pack} initialKind={initialKind} />
      <p className="muted text-xs">
        Every imported row is org-scoped and audited — {t("app.tagline")}
      </p>
    </div>
  );
}
