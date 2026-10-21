import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  IDEA: "badge-low", EXPERIMENTING: "badge-blue", VALIDATED: "badge-green", PARKED: "badge-low", LAUNCHED: "badge-purple",
};

export default async function LabPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const ideas = await sql`
    select id, title, problem, hypothesis, proposed_solution, owner, status, next_step
    from ideas where organization_id = ${orgId} order by created_at desc`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Innovation Lab</h1>
        <p className="page-sub">Ideas, experiments, and strategic initiatives — run like experiments, not opinions.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ideas.map((i) => (
          <div key={i.id} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{i.title}</span>
              <span className={`badge ms-auto ${STATUS_BADGE[i.status] ?? "badge-low"}`}>{i.status}</span>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {i.problem && <div><dt className="inline text-navy-300">Problem: </dt><dd className="inline text-navy-100">{i.problem}</dd></div>}
              {i.hypothesis && <div><dt className="inline text-navy-300">Hypothesis: </dt><dd className="inline text-navy-100">{i.hypothesis}</dd></div>}
              {i.proposed_solution && <div><dt className="inline text-navy-300">Solution: </dt><dd className="inline text-navy-100">{i.proposed_solution}</dd></div>}
              {i.next_step && <div><dt className="inline text-cue-blue">Next step: </dt><dd className="inline text-navy-100">{i.next_step}</dd></div>}
            </dl>
            {i.owner && <div className="mt-2 text-xs text-navy-300/70">Owner: {i.owner}</div>}
          </div>
        ))}
        {ideas.length === 0 && <div className="card p-5 muted">No ideas yet — every improvement starts here.</div>}
      </div>
    </div>
  );
}
