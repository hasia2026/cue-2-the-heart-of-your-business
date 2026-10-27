import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { computeHealth } from "@/lib/health";
import { getT } from "@/lib/locale";
import { getVocab } from "@/lib/vocab";
import type { DictKey } from "@/lib/i18n";
import BusinessLibrary from "./BusinessLibrary";
import { QUESTIONS, SECTION_ORDER, type LibraryQuestion } from "./questions";

const DIM_LABELS: Record<string, DictKey> = {
  revenue: "compass.dim.revenue",
  pipeline: "compass.dim.pipeline",
  operations: "compass.dim.operations",
  inventory: "compass.dim.inventory",
  customers: "compass.dim.customers",
  team: "compass.dim.team",
  data: "compass.dim.data",
};

export const dynamic = "force-dynamic";

export default async function CompassPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;
  const health = await computeHealth(orgId);
  const vocab = await getVocab(orgId);
  const [profile] = await sql`select * from business_profiles where organization_id = ${orgId}`;
  const goals = profile
    ? await sql`select title, detail, horizon, status from goals where profile_id = ${profile.id} and status = 'ACTIVE'`
    : [];

  // Executive library: answered questionnaire rows, newest edits first.
  const library = (await sql`
    select question, answer, updated_at as "updatedAt"
    from business_library where organization_id = ${orgId} order by updated_at desc`) as {
    question: string; answer: string; updatedAt: string;
  }[];
  const sections: Record<string, LibraryQuestion[]> = {};
  for (const section of SECTION_ORDER) {
    const qs = QUESTIONS.filter((q) => q.section === section);
    if (qs.length) sections[section] = qs;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("compass.title")}</h1>
        <p className="page-sub">{t("compass.subtitle")}</p>
      </div>

      {/* Health */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(#2E8BFF ${health.overall * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }}>
            <div className="grid h-24 w-24 place-items-center rounded-full bg-ink-900">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{health.overall}</div>
                <div className="text-[10px] uppercase tracking-widest text-navy-300">{t("compass.score")}</div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="section-title">{t("compass.healthScore")}</h2>
            <p className="muted mt-1 max-w-xl">
              {t("compass.healthSub")}{" "}
              {t("compass.coverage").replace("{pct}", String(Math.round(health.dataQuality * 100)))}
            </p>
          </div>
        </div>
      </section>

      {/* Dimensions */}
      <div className="grid gap-3 md:grid-cols-2">
        {health.dimensions.map((d) => (
          <div key={d.key} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="font-semibold text-white">{d.key === "pipeline" && vocab.dimPipeline ? vocab.dimPipeline : d.key === "inventory" && vocab.dimInventory ? vocab.dimInventory : DIM_LABELS[d.key] ? t(DIM_LABELS[d.key]) : d.label}</div>
              <div className="ms-auto flex items-center gap-2">
                <span className={`badge ${d.score >= 75 ? "badge-green" : d.score >= 55 ? "badge-orange" : "badge-red"}`}>{d.score}</span>
                <span className="text-xs text-navy-300">{t("compass.conf")} {Math.round(d.confidence * 100)}%</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${d.score >= 75 ? "bg-cue-green" : d.score >= 55 ? "bg-cue-orange" : "bg-cue-red"}`} style={{ width: `${d.score}%` }} />
            </div>
            <div className="mt-3 text-xs text-navy-300">
              <div><span className="text-navy-100/80">{t("compass.evidence")}:</span> {d.evidence}</div>
              <div className="mt-1"><span className="text-navy-100/80">{t("compass.reasoning")}:</span> {d.reasoning}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Executive library — the extensive business questionnaire */}
      <BusinessLibrary
        sections={sections}
        answered={library.map((l) => ({ question: l.question, answer: l.answer, updatedAt: l.updatedAt }))}
        canEdit={session.role !== "MEMBER"}
      />

      {/* Profile + goals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-3">{t("compass.profile")}</h2>
          {profile ? (
            <dl className="space-y-2 text-sm">
              {[
                [t("settings.industry"), profile.industry?.replace("_", " ")],
                [t("settings.size"), profile.size],
                [t("settings.locations"), profile.locations],
                [t("settings.businessModel"), profile.business_model],
                [t("settings.offerings"), profile.offerings],
                [t("settings.targetCustomers"), profile.target_customers],
                [t("settings.mission"), profile.mission],
                [t("settings.values"), profile.values_text],
                [t("settings.operationalPriorities"), profile.operational_priorities],
              ].map(([k, v]) =>
                v ? (
                  <div key={k as string} className="grid grid-cols-[130px_1fr] gap-2">
                    <dt className="text-navy-300">{k}</dt>
                    <dd className="whitespace-pre-line text-navy-100">{v}</dd>
                  </div>
                ) : null
              )}
            </dl>
          ) : (
            <p className="muted">{t("compass.onboarding")}</p>
          )}
        </section>

        <section className="card p-6">
          <h2 className="section-title mb-3">{t("compass.goals")}</h2>
          {goals.length ? (
            <ul className="space-y-2.5">
              {goals.map((g, i) => (
                <li key={i} className="rounded-xl border border-white/[0.06] p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy-100">{g.title}</span>
                    {g.horizon && <span className="badge-low ms-auto">{g.horizon}</span>}
                  </div>
                  {g.detail && <p className="muted mt-1 text-xs">{g.detail}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("compass.noGoals")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
