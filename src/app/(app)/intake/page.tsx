import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { getVocab } from "@/lib/vocab";
import { MOCK_SHEET } from "./mock-sheet";
import { HVAC_SHEET } from "./hvac-sheet";
import MockExercise from "./MockExercise";
import HvacMockExercise from "./HvacMockExercise";
import RepairMockExercise from "./RepairMockExercise";
import { REPAIR_SHEET } from "./repair-sheet";
import SalonMockExercise from "./SalonMockExercise";
import { SALON_SHEET } from "./salon-sheet";

export const dynamic = "force-dynamic";

// First-session intake — a checklist of the real setup steps (derived from
// live org state, not check-off boxes the user can fake) plus a hands-on mock
// exercise. The industry pack decides both the vocabulary and the exercise: a
// home-services shop reads an install work order, never a dealership trade-in
// lot sheet.
export default async function IntakePage() {
  await guardWorkspaceModule();
  const { t } = await getT();
  const s = await requireSession();

  const orgId = s.organizationId;
  const vocab = await getVocab(orgId);
  const isHome = vocab.packId === "HOME_SERVICES";
  const isRepair = vocab.packId === "AUTO_REPAIR";
  const isSalon = vocab.packId === "SALON";

  const [profile, docs, insights] = await Promise.all([
    sql`select industry, intake_state from business_profiles where organization_id = ${orgId}`,
    sql`select count(*)::int as n from documents where organization_id = ${orgId} and department_id is not null`,
    sql`select count(*)::int as n from insights where organization_id = ${orgId}`,
  ]);

  const industrySet = Boolean(profile[0]?.industry);
  const intakeState = (profile[0]?.intake_state as Record<string, unknown> | null) ?? {};
  const mock = (intakeState.mockAppraisal as { done?: boolean; stock?: string } | undefined) ?? null;
  const mockCall = (intakeState.mockServiceCall as { done?: boolean; job?: string } | undefined) ?? null;
  const mockRepair = (intakeState.mockRepairOrder as { done?: boolean; ro?: string } | undefined) ?? null;
  const mockSalon = (intakeState.mockSalonTicket as { done?: boolean; ticket?: string } | undefined) ?? null;
  const exerciseDone = isHome
    ? Boolean(mockCall?.done)
    : isRepair
      ? Boolean(mockRepair?.done)
      : isSalon
        ? Boolean(mockSalon?.done)
        : Boolean(mock?.done);
  const filedDocs = Number(docs[0]?.n ?? 0);
  const insightCount = Number(insights[0]?.n ?? 0);

  const steps: { n: number; title: string; why: string; done: boolean; cta?: { href: string; label: string } }[] = [
    {
      n: 1,
      title: "Confirm your business profile",
      why: "Industry, size, and locations tune every detector, label, and pricing rule for how your business actually runs.",
      done: industrySet,
      cta: { href: "/settings", label: "Open Settings → Business profile" },
    },
    {
      n: 2,
      title: "Capture your first document into a folder",
      why: "Anything — a work order, a receipt photo, an AI chat you had about pricing. CUE classifies and files it automatically.",
      done: filedDocs > 0,
      cta: { href: "/capture", label: "Open Capture" },
    },
    {
      n: 3,
      title: isHome ? "Run the mock install work order below" : isRepair ? "Run the mock repair order below" : isSalon ? "Run the mock service ticket below" : "Run the mock trade-in appraisal below",
      why: isHome
        ? "Takes ~3 minutes: read the mock work order, transcribe it into CUE, and a real structured service call comes out the other side."
        : isRepair
          ? "Takes ~3 minutes: read the mock repair order, transcribe it into CUE, and a real structured repair order comes out the other side."
          : isSalon
            ? "Takes ~3 minutes: read the mock service ticket, transcribe it into CUE, and a real structured ticket plus the 3-week rebooking come out the other side."
            : "Takes ~3 minutes: read the mock lot sheet, transcribe it into CUE, and a real structured vehicle record comes out the other side.",
      done: exerciseDone,
    },
    {
      n: 4,
      title: "Import your real records from a CSV",
      why: isHome
        ? "Drop a field-service customer roster, job history, or billing export — map the columns once and CUE turns the file into queryable records. No customer list yet? Tick “create missing customers” and invoice imports materialize any new customers they reference."
        : isRepair
          ? "Drop a shop-management customer roster, repair-order history, or billing export — map the columns once and CUE turns the file into queryable records. No customer list yet? Tick “create missing customers” and invoice imports materialize any new customers they reference."
          : isSalon
            ? "Drop a booking-platform client roster, ticket history, or payout export — map the columns once and CUE turns the file into queryable records. No customer list yet? Tick “create missing customers” and invoice imports materialize any new customers they reference."
            : "Drop a DMS inventory list, customer roster, or billing export — map the columns once and CUE turns the file into queryable records. No customer list yet? Tick “create missing customers” and invoice imports materialize any new customers they reference.",
      done: Boolean((intakeState.csvImport as { done?: boolean } | undefined)?.done),
      cta: { href: "/intake/import", label: "Open the importer" },
    },
    {
      n: 5,
      title: "Run the leak scan (Understand)",
      why: isHome
        ? "The deterministic detectors read your captured data and surface unbilled work, unbooked equipment quotes, and stale leads."
        : isRepair
          ? "The deterministic detectors read your captured data and surface unbilled repair orders, declined work, and stale service enquiries."
          : isSalon
            ? "The deterministic detectors read your captured data and surface unbilled tickets, lapsed regulars, and stale booking enquiries."
            : "The deterministic detectors read your captured data and surface unbilled work, aging inventory, and stale leads.",
      done: insightCount > 0,
      cta: { href: "/understand", label: "Open Understand" },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("nav.intake")}</h1>
        <p className="page-sub">The {isHome || isRepair ? "shop's" : isSalon ? "studio's" : "dealership's"} first 20 minutes in CUE — checklist plus a hands-on mock exercise.</p>
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
        <h2 className="section-title mb-1">
          {isHome ? "Mock exercise — walk an install work order into CUE" : isRepair ? "Mock exercise — walk a repair order into CUE" : isSalon ? "Mock exercise — walk a service ticket into CUE" : "Mock exercise — walk a trade-in appraisal into CUE"}
        </h2>
        <p className="muted mb-4 text-xs">
          {isHome
            ? "This is exactly how a real field-service export will work: CUE shows the source work order, you transcribe the numbers, and they land as a structured service call your detectors can query. Numbers wrong? You get pointed hints, not a silent save."
            : isRepair
              ? "This is exactly how a real shop-management export will work: CUE shows the source repair order, you transcribe the numbers, and they land as a structured record your detectors can bill against. Numbers wrong? You get pointed hints, not a silent save."
              : isSalon
                ? "This is exactly how a real booking-platform export will work: CUE shows the source ticket, you transcribe the numbers, and it lands as a structured service ticket with the next appointment already on the board. Numbers wrong? You get pointed hints, not a silent save."
                : "This is exactly how a real DMS/trade export will work: CUE shows the source sheet, you transcribe the numbers, and they land as a structured vehicle record your detectors can query. Numbers wrong? You get pointed hints, not a silent save."}
        </p>
        {exerciseDone ? (
          <div className="rounded-xl border border-cue-green/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {isHome ? (
              <>✓ Exercise complete — structured service call <strong className="font-semibold">{mockCall?.job ?? "MOCK-SC-8842"}</strong> is
              in your service calls (status OPEN, clearly prefixed MOCK-). Real exports will land the same way.</>
            ) : isRepair ? (
              <>✓ Exercise complete — structured repair order <strong className="font-semibold">{mockRepair?.ro ?? "MOCK-RO-4417"}</strong> is
              in your repair orders (status OPEN, clearly prefixed MOCK-). Real exports will land the same way.</>
            ) : isSalon ? (
              <>✓ Exercise complete — structured service ticket <strong className="font-semibold">{mockSalon?.ticket ?? "MOCK-ST-2291"}</strong> is
              in your service tickets, and the 3-week rebooking is on the appointments board (both clearly prefixed MOCK-). Real exports will land the same way.</>
            ) : (
              <>✓ Exercise complete — structured record <strong className="font-semibold">{mock?.stock ?? "MOCK-MT-7721"}</strong> is
              in your vehicles (status RESERVED, clearly prefixed MOCK-). Real exports will land the same way.</>
            )}
          </div>
        ) : isHome ? (
          <HvacMockExercise sheet={HVAC_SHEET} />
        ) : isRepair ? (
          <RepairMockExercise sheet={REPAIR_SHEET} />
        ) : isSalon ? (
          <SalonMockExercise sheet={SALON_SHEET} />
        ) : (
          <MockExercise sheet={MOCK_SHEET} />
        )}
      </section>
    </div>
  );
}
