import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { logReview, requestReview } from "./actions";

export const dynamic = "force-dynamic";

type Review = {
  id: string; rating: number | null; channel: string; comment: string | null;
  status: string; requestedAt: string; receivedAt: string | null; customer: string | null;
};

export default async function ReviewsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const rows = await sql`
    select r.id, r.rating, r.channel, r.comment, r.status,
      r.requested_at as "requestedAt", r.received_at as "receivedAt", c.name as customer
    from reviews r left join customers c on c.id = r.customer_id
    where r.organization_id = ${orgId}
    order by coalesce(r.received_at, r.requested_at) desc limit 80`;
  const reviews = rows as unknown as Review[];

  const [stats] = await sql`
    select
      (count(*) filter (where status = 'RECEIVED'))::int as received,
      (count(*) filter (where status = 'REQUESTED'))::int as requested,
      coalesce(round(avg(rating) filter (where status = 'RECEIVED'), 1), 0)::float as avg
    from reviews where organization_id = ${orgId}`;

  const customers = await sql`select id, name from customers where organization_id = ${orgId} order by name`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reviews</h1>
        <p className="page-sub">Ask happy clients for a review, then log what comes back — reputation you can see, not guess.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Average rating</div><div className="kpi mt-1">{Number(stats?.avg ?? 0).toFixed(1)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Reviews received</div><div className="kpi mt-1">{stats?.received ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Requests pending</div><div className="kpi mt-1">{stats?.requested ?? 0}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="card p-5" open>
          <summary className="cursor-pointer text-sm font-semibold text-white">Request a review</summary>
          <form action={requestReview} className="mt-4 grid gap-3">
            <div>
              <label className="label" htmlFor="rev-customer">Client</label>
              <select id="rev-customer" name="customerId" className="input" required>
                <option value="">Choose a client…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rev-channel">Where</label>
              <select id="rev-channel" name="channel" className="input" defaultValue="GOOGLE">
                <option value="GOOGLE">Google</option>
                <option value="SMS">Text</option>
                <option value="EMAIL">Email</option>
                <option value="IN_PERSON">In person</option>
              </select>
            </div>
            <button className="btn-primary text-sm">Log the request</button>
            <p className="muted text-xs">CUE records that you asked; nothing is sent automatically.</p>
          </form>
        </details>

        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white">Log a review</summary>
          <form action={logReview} className="mt-4 grid gap-3">
            <div>
              <label className="label" htmlFor="log-customer">Client (optional)</label>
              <select id="log-customer" name="customerId" className="input" defaultValue="">
                <option value="">Anonymous</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="log-rating">Rating</label>
                <select id="log-rating" name="rating" className="input" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="log-channel">Where</label>
                <select id="log-channel" name="channel" className="input" defaultValue="GOOGLE">
                  <option value="GOOGLE">Google</option>
                  <option value="SMS">Text</option>
                  <option value="EMAIL">Email</option>
                  <option value="IN_PERSON">In person</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="log-comment">What they said</label>
              <textarea id="log-comment" name="comment" className="input" rows={2} placeholder="Great gel manicure, very clean tools." />
            </div>
            <button className="btn-primary text-sm">Save review</button>
          </form>
        </details>
      </div>

      <section>
        <h2 className="section-title mb-3">Review log</h2>
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-3 p-4">
              <span className="text-lg text-amber-300">{r.rating ? "★".repeat(r.rating) : "—"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-navy-100">{r.customer ?? "Anonymous"}</div>
                {r.comment && <p className="muted mt-0.5 text-xs">{r.comment}</p>}
              </div>
              <span className="badge-blue">{r.channel.replace("_", " ")}</span>
              <span className={`badge ${r.status === "RECEIVED" ? "badge-green" : "badge-low"}`}>{r.status}</span>
              <span className="text-[11px] text-navy-300">
                {new Date(r.receivedAt ?? r.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
          {reviews.length === 0 && <div className="card p-6 muted">No reviews tracked yet. Log a request after a visit, or add one that came in.</div>}
        </div>
      </section>
    </div>
  );
}
