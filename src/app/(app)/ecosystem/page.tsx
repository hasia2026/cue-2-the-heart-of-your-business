import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { whatsappConnected } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  CONNECTED: "badge-green", DEMO: "badge-orange", AVAILABLE: "badge-blue",
};

export default async function EcosystemPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const integrations = await sql`
    select id, key, name, category, status, data_available, capabilities, webhook_secret
    from integrations where organization_id = ${orgId} order by category, name`;

  // ReferPro ingest URL — shown here so the owner can hand it to ReferPro
  // without touching the database. The secret is in the query because
  // webhook senders (like calendar clients) cannot sign in or set headers.
  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "localhost:3210";
  const proto = (await headers()).get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const referproUrl = (ref: { key: string; webhook_secret: string | null } | undefined) =>
    ref?.key === "referpro" && ref.webhook_secret
      ? `${proto}://${host}/api/ingest/referpro?token=${ref.webhook_secret}`
      : null;

  // WhatsApp status is computed live from env — never fabricated from the seed row.
  const liveStatus = (key: string, status: string) =>
    key === "whatsapp_cloud" && whatsappConnected() ? "CONNECTED" : status;

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
        {integrations.map((i) => {
          const hook = referproUrl(i as { key: string; webhook_secret: string | null });
          return (
          <div key={i.id} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{i.name}</span>
              <span className={`badge ms-auto ${STATUS_BADGE[liveStatus(i.key, i.status)] ?? "badge-low"}`}>{liveStatus(i.key, i.status)}</span>
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
            {hook && (
              <div className="mt-3 rounded-lg bg-white/[0.04] p-2.5 text-xs">
                <div className="font-semibold text-navy-100">Your webhook URL — paste into ReferPro:</div>
                <code className="mt-1 block break-all text-[11px] text-violet-200" style={{ wordBreak: "break-all" }}>{hook}</code>
                <div className="mt-1 text-navy-300/70">Leads arrive in Pipeline tagged REFERPRO the moment ReferPro posts an event.</div>
              </div>
            )}
          </div>
          );
        })}
        {integrations.length === 0 && <div className="card p-5 muted">No integrations configured yet.</div>}
      </div>
    </div>
  );
}
