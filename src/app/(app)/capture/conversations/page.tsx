import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { logConversation } from "./actions";

export const dynamic = "force-dynamic";

type Comm = {
  id: string; channel: string; direction: string; summary: string; at: string; customer: string;
};

const channelTint = (c: string) =>
  c === "EMAIL" ? "badge-blue" : c === "SMS" ? "badge-purple" : c === "IN_PERSON" ? "badge-low" : "badge-green";

export default async function ConversationsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await sql`
    select co.id, co.channel, co.direction, co.summary, co.occurred_at as at, c.name as customer
    from communications co join customers c on c.id = co.customer_id
    where co.organization_id = ${orgId}
    order by co.occurred_at desc limit 80`;
  const comms = rows as unknown as Comm[];
  const customers = await sql`select id, name from customers where organization_id = ${orgId} order by name`;

  const weekAgo = Date.now() - 7 * 864e5;
  const recent = comms.filter((c) => new Date(c.at).getTime() >= weekAgo);
  const inbound = recent.filter((c) => c.direction === "INBOUND").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Conversations</h1>
        <p className="page-sub">Calls, texts, emails and in-person notes in one thread list — logged against the customer, never lost.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Last 7 days</div><div className="kpi mt-1">{recent.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Inbound</div><div className="kpi mt-1">{inbound}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Outbound</div><div className="kpi mt-1">{recent.length - inbound}</div></div>
      </div>

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-semibold text-white">Log a conversation</summary>
        <form action={logConversation} className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="conv-customer">Customer</label>
            <select id="conv-customer" name="customerId" className="input" required>
              <option value="">Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="conv-channel">Channel</label>
              <select id="conv-channel" name="channel" className="input" defaultValue="PHONE">
                <option value="PHONE">Call</option>
                <option value="SMS">Text</option>
                <option value="EMAIL">Email</option>
                <option value="IN_PERSON">In person</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="conv-direction">Direction</label>
              <select id="conv-direction" name="direction" className="input" defaultValue="INBOUND">
                <option value="INBOUND">Inbound</option>
                <option value="OUTBOUND">Outbound</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="conv-summary">What was said</label>
            <textarea id="conv-summary" name="summary" className="input" rows={2} placeholder="Asked about a Saturday appointment; prefers a Vietnamese confirmation text." required />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary text-sm">Log it</button>
          </div>
        </form>
      </details>

      <section>
        <h2 className="section-title mb-3">Thread list</h2>
        <div className="space-y-2">
          {comms.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-navy-100">{c.customer}</span>
                <span className={`badge ${channelTint(c.channel)}`}>{c.channel.replace("_", " ")}</span>
                <span className={`badge ${c.direction === "INBOUND" ? "badge-blue" : "badge-low"}`}>{c.direction}</span>
                <span className="ms-auto text-[11px] text-navy-300">
                  {new Date(c.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="muted mt-1 text-sm">{c.summary}</p>
            </div>
          ))}
          {comms.length === 0 && <div className="card p-6 muted">No conversations logged yet.</div>}
        </div>
      </section>
    </div>
  );
}
