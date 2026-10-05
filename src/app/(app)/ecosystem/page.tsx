import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  CONNECTED: "badge-green", DEMO: "badge-orange", AVAILABLE: "badge-blue",
};

export default async function EcosystemPage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const integrations = await sql`
    select id, key, name, category, status, data_available, capabilities
    from integrations where organization_id = ${orgId} order by category, name`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Connected Ecosystem</h1>
        <p className="page-sub">One platform, honest connections. Demo sources are clearly labeled — nothing pretends to be live.</p>
      </div>

      <div className="card p-4 text-sm text-navy-300">
        <span className="badge-orange me-2">DEMO</span> sample data for the pilot &nbsp;·&nbsp;
        <span className="badge-blue me-2">AVAILABLE</span> architecture ready, credentials pending &nbsp;·&nbsp;
        <span className="badge-green me-2">CONNECTED</span> live two-way integration
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {integrations.map((i) => (
          <div key={i.id} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{i.name}</span>
              <span className={`badge ms-auto ${STATUS_BADGE[i.status] ?? "badge-low"}`}>{i.status}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-navy-300/60">{i.category}</div>
            <dl className="mt-3 space-y-1 text-xs">
              {i.data_available && (
                <div><dt className="inline text-navy-300">Data available: </dt><dd className="inline text-navy-100">{i.data_available}</dd></div>
              )}
              {i.capabilities && (
                <div><dt className="inline text-navy-300">What CUE can do: </dt><dd className="inline text-navy-100">{i.capabilities}</dd></div>
              )}
            </dl>
          </div>
        ))}
        {integrations.length === 0 && <div className="card p-5 muted">No integrations configured yet.</div>}
      </div>
    </div>
  );
}
