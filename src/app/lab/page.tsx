import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

const STATUS_STYLE: Record<string, string> = {
  IDEA: "badge-low",
  EXPERIMENTING: "badge-blue",
  VALIDATED: "badge-green",
  LAUNCHED: "badge-green",
  PARKED: "badge-low",
};

export default async function LabPage() {
  const session = await requireSession();
  const ideas = await prisma.idea.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell crumb="Innovation Lab">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Innovation Lab</h1>
          <p className="muted mt-1">Ideas and experiments with a problem, hypothesis, evidence and next step — so innovation is disciplined, not hopeful.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((i) => (
            <article key={i.id} className="card p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className={STATUS_STYLE[i.status] ?? "badge-low"}>{i.status}</span>
                {i.owner && <span className="ml-auto text-xs text-navy-400">👤 {i.owner}</span>}
              </div>
              <h2 className="text-sm font-semibold text-navy-900">{i.title}</h2>
              <dl className="mt-3 space-y-2 text-xs flex-1">
                {[
                  ["Problem", i.problem],
                  ["Hypothesis", i.hypothesis],
                  ["Solution", i.proposedSolution],
                  ["Evidence", i.evidence],
                ].map(([label, val]) =>
                  val ? (
                    <div key={label!}>
                      <dt className="font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
                      <dd className="text-navy-600 mt-0.5">{val}</dd>
                    </div>
                  ) : null
                )}
              </dl>
              {i.nextStep && (
                <div className="mt-3 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs text-navy-700">
                  <span className="font-semibold">Next step:</span> {i.nextStep}
                </div>
              )}
            </article>
          ))}
          {ideas.length === 0 && <p className="muted">No ideas yet — every experiment starts as a documented hypothesis.</p>}
        </div>
      </div>
    </AppShell>
  );
}
