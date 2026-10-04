import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function EnhancePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [assets, insights, procedures] = await Promise.all([
    prisma.brandAsset.findMany({ where: { organizationId: orgId }, orderBy: { kind: "asc" } }),
    prisma.insight.findMany({
      where: { organizationId: orgId, type: { in: ["CUSTOMER", "OPERATIONS"] }, status: "OPEN" },
      take: 6,
    }),
    prisma.knowledgeItem.findMany({
      where: { organizationId: orgId, category: "PROCEDURE" },
      take: 6,
    }),
  ]);

  return (
    <AppShell crumb="Enhance">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Enhance</h1>
          <p className="muted mt-1">Improve the brand, the customer experience, and the way work gets done — driven by what CUE sees in the data.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Brand Studio */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Brand Studio</h2>
            <p className="muted mb-4">Assets and guidelines CUE keeps organized and consistent.</p>
            <div className="space-y-2.5">
              {assets.map((a) => (
                <div key={a.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="badge-purple">{a.kind}</span>
                    <span className="text-sm font-medium text-navy-900 truncate">{a.name}</span>
                  </div>
                  {a.description && <p className="text-xs text-navy-500 mt-1">{a.description}</p>}
                </div>
              ))}
              {assets.length === 0 && <p className="muted">No brand assets yet.</p>}
            </div>
          </section>

          {/* Customer Experience */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Customer Experience</h2>
            <p className="muted mb-4">Signals from communications and jobs that point to experience gaps.</p>
            <div className="space-y-2.5">
              {insights.filter((i) => i.type === "CUSTOMER").map((i) => (
                <div key={i.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{i.title}</div>
                  <p className="text-xs text-navy-500 mt-1">{i.summary}</p>
                </div>
              ))}
              {insights.filter((i) => i.type === "CUSTOMER").length === 0 && (
                <p className="muted">No customer-experience signals right now. Follow-up coverage looks healthy.</p>
              )}
              <div className="rounded-xl border border-navy-100 p-3.5">
                <div className="text-sm font-medium text-navy-900">Communication coverage</div>
                <p className="text-xs text-navy-500 mt-1">
                  Communications are logged against customers, giving CUE the timeline it needs to spot silent accounts before they churn.
                </p>
              </div>
            </div>
          </section>

          {/* Process Improvement */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Process Improvement</h2>
            <p className="muted mb-4">Documented procedures and where the data shows friction.</p>
            <div className="space-y-2.5">
              {insights.filter((i) => i.type === "OPERATIONS").map((i) => (
                <div key={i.id} className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{i.title}</div>
                  <p className="text-xs text-navy-500 mt-1">{i.summary}</p>
                </div>
              ))}
              {procedures.map((p) => (
                <div key={p.id} className="rounded-xl border border-navy-100 p-3.5">
                  <div className="text-sm font-medium text-navy-900">{p.title}</div>
                  <div className="text-[11px] text-navy-400 mt-0.5 line-clamp-2">{p.content.slice(0, 110)}…</div>
                </div>
              ))}
              {procedures.length === 0 && insights.filter((i) => i.type === "OPERATIONS").length === 0 && (
                <p className="muted">No process signals yet.</p>
              )}
            </div>
          </section>
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-1">Why this connects</h2>
          <p className="muted">
            A signal first seen in Understand (e.g. unbilled jobs) becomes a process fix here, an action plan in Execute, and a training module in Expand — closing the loop back into Company Compass.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
