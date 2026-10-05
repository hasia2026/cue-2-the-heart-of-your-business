import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { computeHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function CompassPage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const health = await computeHealth(orgId);
  const [profile] = await sql`select * from business_profiles where organization_id = ${orgId}`;
  const goals = profile
    ? await sql`select title, detail, horizon, status from goals where profile_id = ${profile.id} and status = 'ACTIVE'`
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Company Compass</h1>
        <p className="page-sub">The strategic center — profile, goals, and an explainable health score.</p>
      </div>

      {/* Health */}
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(#2E8BFF ${health.overall * 3.6}deg, rgba(255,255,255,0.06) 0deg)` }}>
            <div className="grid h-24 w-24 place-items-center rounded-full bg-ink-900">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{health.overall}</div>
                <div className="text-[10px] uppercase tracking-widest text-navy-300">score</div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="section-title">Business Health Score</h2>
            <p className="muted mt-1 max-w-xl">
              Computed live from your actual records — <em>not</em> a scientific rating. Every dimension below shows
              Score → Evidence → Reasoning → Confidence. {Math.round(health.dataQuality * 100)}% of dimensions have enough data to score.
            </p>
          </div>
        </div>
      </section>

      {/* Dimensions */}
      <div className="grid gap-3 md:grid-cols-2">
        {health.dimensions.map((d) => (
          <div key={d.key} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="font-semibold text-white">{d.label}</div>
              <div className="ms-auto flex items-center gap-2">
                <span className={`badge ${d.score >= 75 ? "badge-green" : d.score >= 55 ? "badge-orange" : "badge-red"}`}>{d.score}</span>
                <span className="text-xs text-navy-300">conf {Math.round(d.confidence * 100)}%</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${d.score >= 75 ? "bg-cue-green" : d.score >= 55 ? "bg-cue-orange" : "bg-cue-red"}`} style={{ width: `${d.score}%` }} />
            </div>
            <div className="mt-3 text-xs text-navy-300">
              <div><span className="text-navy-100/80">Evidence:</span> {d.evidence}</div>
              <div className="mt-1"><span className="text-navy-100/80">Reasoning:</span> {d.reasoning}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Profile + goals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-3">Business profile</h2>
          {profile ? (
            <dl className="space-y-2 text-sm">
              {[
                ["Industry", profile.industry?.replace("_", " ")],
                ["Size", profile.size],
                ["Locations", profile.locations],
                ["Business model", profile.business_model],
                ["Offerings", profile.offerings],
                ["Target customers", profile.target_customers],
                ["Mission", profile.mission],
                ["Values", profile.values_text],
                ["Operational priorities", profile.operational_priorities],
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
            <p className="muted">Complete onboarding to build your profile.</p>
          )}
        </section>

        <section className="card p-6">
          <h2 className="section-title mb-3">Active goals</h2>
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
            <p className="muted">No active goals yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
