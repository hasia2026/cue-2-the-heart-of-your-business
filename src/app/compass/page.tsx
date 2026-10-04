import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { computeHealth } from "@/lib/health";
import { runSimulations } from "@/lib/simulator";
import { money } from "@/lib/format";
import AppShell from "@/components/AppShell";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-accent-blue";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-accent-blue";
  if (score >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function confidenceBadge(c: string) {
  if (c === "HIGH") return <span className="badge-green">High confidence</span>;
  if (c === "MEDIUM") return <span className="badge-medium">Medium confidence</span>;
  return <span className="badge-low">Low confidence</span>;
}

export default async function CompassPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [profile, health, leaders, sims] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { organizationId: orgId }, include: { goals: true } }),
    computeHealth(orgId),
    prisma.employee.findMany({
      where: { organizationId: orgId, title: { in: ["Owner", "Operations Manager", "Office Manager"] } },
    }),
    runSimulations(orgId),
  ]);

  if (!profile) {
    return (
      <AppShell crumb="Company Compass">
        <div className="card p-8 text-center">
          <p className="muted">No business profile yet. Run the demo seed or complete onboarding.</p>
        </div>
      </AppShell>
    );
  }

  const offerings = (profile.offerings ?? "").split("\n").filter(Boolean);
  const values = (profile.values ?? "").split("\n").filter(Boolean);
  const priorities = (profile.operationalPriorities ?? "").split("\n").filter(Boolean);

  return (
    <AppShell crumb="Company Compass">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Company Compass</h1>
          <p className="muted mt-1">The strategic center of {profile.name} — what CUE knows, and how the business is doing.</p>
        </div>

        {/* Overall health */}
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-navy-400 mb-1">Business Health</div>
                <div className={`text-6xl font-bold leading-none ${health.overall === null ? "text-navy-300" : scoreColor(health.overall)}`}>
                  {health.overall ?? "—"}
                </div>
              </div>
              <div className="max-w-md">
                {confidenceBadge(health.confidence)}
                <p className="text-sm text-navy-600 mt-2">{health.disclaimer}</p>
              </div>
            </div>
          </div>

          <div className="divider my-5" />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {health.dimensions.map((d) => (
              <div key={d.key} className="rounded-xl border border-navy-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-navy-800">{d.label}</div>
                  <div className={`text-xl font-bold ${scoreColor(d.score)}`}>{d.score}</div>
                </div>
                <div className="h-1.5 rounded-full bg-navy-100 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(d.score)}`} style={{ width: `${d.score}%` }} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {confidenceBadge(d.confidence)}
                  <div className="text-xs text-navy-500"><span className="font-semibold text-navy-600">Evidence:</span> {d.basis}</div>
                  <div className="text-xs text-navy-500"><span className="font-semibold text-navy-600">Why:</span> {d.reasoning}</div>
                  {d.recommendation && (
                    <div className="text-xs text-accent-blue font-medium mt-1">→ {d.recommendation}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Profile */}
          <section className="card p-6 space-y-4">
            <h2 className="section-title">Business profile</h2>
            <Row label="Company" value={profile.name} />
            <Row label="Industry" value={profile.industry} />
            <Row label="Size" value={profile.size} />
            <Row label="Locations" value={profile.locations} />
            <Row label="Business model" value={profile.businessModel} />
            <Row label="Target customers" value={profile.targetCustomers} />
            <Row label="Mission" value={profile.mission} />
            <div>
              <div className="label">Services & products</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {offerings.map((o) => <li key={o} className="flex gap-2"><span className="text-accent-blue">•</span>{o}</li>)}
              </ul>
            </div>
            <div>
              <div className="label">Values</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {values.map((v) => <li key={v} className="flex gap-2"><span className="text-accent-purple">•</span>{v}</li>)}
              </ul>
            </div>
            <div>
              <div className="label">Operational priorities</div>
              <ul className="text-sm text-navy-700 space-y-1">
                {priorities.map((p) => <li key={p} className="flex gap-2"><span className="text-accent-orange">•</span>{p}</li>)}
              </ul>
            </div>
          </section>

          <div className="space-y-6">
            {/* Goals */}
            <section className="card p-6">
              <h2 className="section-title mb-3">Goals</h2>
              <div className="space-y-2.5">
                {profile.goals.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-xl border border-navy-100 px-4 py-3">
                    <span className={g.horizon === "YEAR" ? "badge-purple" : "badge-blue"}>{g.horizon === "YEAR" ? "This year" : "This quarter"}</span>
                    <span className="text-sm text-navy-800 flex-1">{g.title}</span>
                  </div>
                ))}
                {profile.goals.length === 0 && <p className="muted">No goals defined yet.</p>}
              </div>
            </section>

            {/* What-if simulator */}
            <section className="card p-6">
              <h2 className="section-title mb-1">What-if simulator</h2>
              <p className="muted text-sm mb-4">Projections from your own conversion history — the math is shown, never hidden.</p>
              <div className="space-y-4">
                {sims.simulations.map((s) => (
                  <div key={s.title} className="rounded-xl border border-navy-100 bg-white/[0.03] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm font-semibold text-navy-900">{s.title}</div>
                      <div className="text-xl font-bold bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">
                        {s.rate !== null ? money(s.projected) : "—"}
                      </div>
                    </div>
                    <div className="text-xs text-navy-500 mt-1">
                      {s.openCount} open · {money(s.openValue)} in play · {s.rateBasis}
                    </div>
                    <div className="mt-2.5 rounded-lg bg-black/20 border border-navy-50 px-3 py-2 font-mono text-[11px] text-navy-500">
                      {s.math}
                    </div>
                  </div>
                ))}
                {sims.simulations.length === 0 && <p className="muted">No open opportunities to simulate yet.</p>}
              </div>
            </section>

            {/* Leadership */}
            <section className="card p-6">
              <h2 className="section-title mb-3">Leadership</h2>
              <div className="space-y-2.5">
                {leaders.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-white text-xs font-semibold flex items-center justify-center">
                      {l.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-navy-900">{l.name}</div>
                      <div className="text-xs text-navy-500">{l.title} · {l.responsibilities}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-navy-700">{value}</div>
    </div>
  );
}
