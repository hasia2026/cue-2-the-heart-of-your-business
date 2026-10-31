import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import {
  agingBreakdown,
  agingInvoices,
  AGING_COLORS,
  type AgingBucketKey,
} from "@/lib/suggested-order";

export const dynamic = "force-dynamic";

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Overdue AR aging — the page the weekly digest's colored buckets open.
// One bucket of the overdue book at a time (same overdue definition and
// intervals as the digest, both served by the same lib helpers), with the
// count tabs on top so the owner can sweep fresh → stale. Every record here
// is what Revi's suggested order is chasing — this is the money drill-down.
const BUCKET_KEYS: AgingBucketKey[] = ["fresh", "mid", "stale"];

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const { bucket } = await searchParams;
  const active: AgingBucketKey = BUCKET_KEYS.includes(bucket as AgingBucketKey)
    ? (bucket as AgingBucketKey)
    : "fresh";

  const buckets = await agingBreakdown(orgId);
  const rows = await agingInvoices(orgId, active);
  const activeBucket = buckets.find((b) => b.key === active)!;
  const edge = active === "fresh" ? "0–15" : active === "mid" ? "15–30" : "30+";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pipeline" className="text-xs text-navy-300 hover:text-white">← Pipeline</Link>
        <h1 className="page-title mt-1">Overdue invoices — {activeBucket.label}</h1>
        <p className="page-sub">
          {money(activeBucket.total)} at stake in {activeBucket.count} invoice{activeBucket.count === 1 ? "" : "s"}.
          The same overdue book the weekly digest buckets — chase oldest first; suggest the fix from Intake → Import when a customer&apos;s records are behind.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {buckets.map((b) => (
          <Link
            key={b.key}
            href={`/pipeline/aging?bucket=${b.key}`}
            className={`rounded-xl px-3.5 py-2 text-sm transition ${
              active === b.key
                ? "bg-violet-500/15 font-semibold text-violet-200"
                : "text-navy-100/80 hover:bg-white/[0.05] hover:text-white"
            }`}
            style={active === b.key ? { color: AGING_COLORS[b.key] } : undefined}
          >
            {b.label}
            {b.count > 0 && <span className="badge-low ms-2">{b.count}</span>}
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-3">
          {edge} days past due ({rows.length}) · {money(activeBucket.total)}
        </h2>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-navy-100">{r.number}</span>
                <span className="badge-purple">{r.kind}</span>
                {r.customerId ? (
                  <Link href={`/pipeline/customers/${r.customerId}`} className="text-navy-100/80 hover:text-violet-200">
                    {r.customer ?? "—"}
                  </Link>
                ) : (
                  <span className="text-navy-100/80">{r.customer ?? "—"}</span>
                )}
                <span className={`badge ms-auto ${active === "stale" ? "badge-red" : active === "mid" ? "badge-orange" : "badge-green"}`}>
                  {r.daysOverdue}d over
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-navy-300">
                <span className="font-semibold text-navy-100">{money(r.amount)}</span>
                <span>due {r.dueAt}</span>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="muted">Nothing in this bucket — that part of the book is clean.</p>}
        </div>
      </section>
    </div>
  );
}
