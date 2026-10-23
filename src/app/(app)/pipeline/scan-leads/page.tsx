import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { pushConfigured } from "@/lib/push";
import ScanLeadRow from "../ScanLeadRow";
import LeadPushToggle from "./LeadPushToggle";

export const dynamic = "force-dynamic";

/**
 * Scan-lead inbox — the flyer-QR capture list for the CUE operator. These
 * leads asked for the free 20-min scan call; nothing is automated here yet.
 * Call status + follow-up notes keep outreach accountable. scan_leads is
 * org-less (public capture), so this page is role-gated (Owner/Admin only),
 * not org-scoped.
 */
export default async function ScanLeadsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const canEdit = session.role !== "MEMBER" && session.role !== "MANAGER";

  const leads = await sql`
    select id, name, shop, phone, email, source, status, note, created_at
    from scan_leads
    order by case status when 'NEW' then 0 when 'CALLED' then 1 when 'BOOKED' then 2 else 3 end,
      created_at asc
    limit 100`;

  const [stats] = await sql`
    select count(*)::int as total,
           count(*) filter (where status = 'NEW')::int as fresh,
           count(*) filter (where status = 'BOOKED')::int as booked,
           count(*) filter (where status = 'NOT_INTERESTED')::int as dead
    from scan_leads`;

  const n = (d: Date | string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="page-title">Scan-call leads</h1>
        <p className="page-sub">
          {stats?.total ?? 0} total · {stats?.fresh ?? 0} new · {stats?.booked ?? 0} booked ·{" "}
          {stats?.dead ?? 0} not interested — oldest first so nobody waits.
        </p>
      </div>
      <LeadPushToggle configured={pushConfigured()} />
      <div className="card divide-y divide-white/[0.06]">
        {leads.map((l) => (
          <div key={String(l.id)} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-navy-100">{String(l.name)}</span>
              <span className="text-xs text-navy-300">{String(l.shop)}</span>
              <span className="text-xs text-navy-300">
                <a href={`tel:${String(l.phone)}`} className="underline decoration-white/20">{String(l.phone)}</a>
              </span>
              {l.email && <span className="text-xs text-navy-300">{String(l.email)}</span>}
              <span className="badge ml-auto">{String(l.source)}</span>
              <span className="text-xs text-navy-300">{n(l.created_at as string)}</span>
            </div>
            <ScanLeadRow
              leadId={String(l.id)}
              status={String(l.status)}
              note={l.note ? String(l.note) : null}
              canEdit={canEdit}
            />
          </div>
        ))}
        {leads.length === 0 && <p className="muted p-4">No scan-call leads yet — the flyer QRs feed this list.</p>}
      </div>
    </div>
  );
}
