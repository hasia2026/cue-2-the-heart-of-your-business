import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { MOCK_SHEET } from "./mock-sheet";
import MockExercise from "./MockExercise";

export const dynamic = "force-dynamic";

// Dealership intake — the guided first session: a checklist of the real
// setup steps (derived from live org state, not check-off boxes the user
// can fake) plus the mock appraisal exercise that walks a trade-in
// export into CUE's structured records before a real importer runs.
export default async function IntakePage() {
  await requireSession();
  const { t } = await getT();
  const s = await requireSession();

  const orgId = s.organizationId;
  const [profile, docs, insights] = await Promise.all([
    sql`select industry, intake_state from business_profiles where organization_id = ${orgId}`,
    sql`select count(*)::int as n from documents where organization_id = ${orgId} and department_id is not null`,
    sql`select count(*)::int as n from insights where organization_id = ${orgId}`,
  ]);

  const industrySet = Boolean(profile[0]?.industry);
  const intakeState = (profile[0]?.intake_state as Record<string, unknown> | null) ?? {};
  const mock = (intakeState.mockAppraisal as { done?: boolean; stock?: string } | undefined) ?? null;
  const filedDocs = Number(docs[0]?.n ?? 0);
  const insightCount = Number(insights[0]?.n ?? 0);

  const steps: { n: number; title: string; why: string; done: boolean; cta?: { href: string; label: string } }[] = [
    {
      n: 1,
      title: "Confirm your business profile",
      why: "Industry + size tune every detector, label, and pricing rule for how your dealership actually runs.",
      done: industrySet,
      cta: { href: "/settings", label: "Open Settings → Business profile" },
    },
    {
      n: 2,
      title: "Capture your first document into a folder",
      why: "Anything — a RO, a receipt photo, an AI chat you had about pricing. CUE classifies and files it automatically.",
      done: filedDocs > 0,
      cta: { href: "/capture", label: "Open Capture" },
    },
    {
      n: 3,
      title: "Run the mock trade-in appraisal below",
      why: "Takes ~3 minutes: read the mock lot sheet, transcribe it into CUE, and a real structured vehicle record comes out the other side.",
      done: Boolean(mock?.done),
    },
    {
      n: 4,
      title: "Import your real records from a CSV",
      why: "Drop a DMS inventory list, customer roster, or billing export — map the columns once and CUE turns the file into queryable records. No customer list yet? Tick “create missing customers” and invoice imports materialize any new customers they reference."}
      done: Boolean((intakeState.csvImport as { done?: boolean } | undefined)?.done),
      cta: { href: "/intake/import", label: "Open the importer" },
    },
    {
      n: 5,
      title: "Run the leak scan (Understand)",
      why: "The deterministic detectors read your captured data and surface unbilled work, aging inventory, and stale leads.",
      done: insightCount > 0,
      cta: { href: "/understand", label: "Open Understand" },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("nav.intake")}</h1>
        <p className="page-sub">The dealership&apos;s first 20 minutes in CUE — checklist plus a hands-on mock exercise.</p>
      </div>

      <section className="card p-6">
        <h2 className="section-title mb-4">Intake checklist</h2>
        <ul className="space-y-3">
          {steps.map((step) => (
            <li key={step.n} className="flex items-start gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
              <span className={`badge mt-0.5 ${step.done ? "badge-green" : "badge-low"}`}>{step.done ? "✓" : step.n}</span>
              <div className="min-w-0">
                <div className={`font-medium ${step.done ? "text-emerald-200 line-through decoration-emerald-500/40" : "text-navy-100"}`}>
                  {step.title}
                </div>
                <div className="muted text-xs">{step.why}</div>
                {!step.done && step.cta && (
                  <a href={step.cta.href} className="btn-ghost mt-2 !px-3 !py-1.5 text-xs">{step.cta.label} →</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">Mock exercise — walk a trade-in appraisal into CUE</h2>
        <p className="muted mb-4 text-xs">
          This is exactly how a real DMS/trade export will work: CUE shows the source sheet, you transcribe the numbers,
          and they land as a structured vehicle record your detectors can query. Numbers wrong? You get pointed hints,
          not a silent save.
        </p>
        {mock?.done ? (
          <div className="rounded-xl border border-cue-green/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            ✓ Exercise complete — structured record <strong className="font-semibold">{mock.stock ?? "MOCK-MT-7721"}</strong> is
            in your vehicles (status RESERVED, clearly prefixed MOCK-). Real exports will land the same way.
          </div>
        ) : (
          <MockExercise sheet={MOCK_SHEET} />
        )}
      </section>
    </div>
  );
}
