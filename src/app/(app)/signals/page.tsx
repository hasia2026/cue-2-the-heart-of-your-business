import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { sql } from "@/lib/db";
import { convertSignalToLead, convertSignalToInsight, dismissSignal, addDemoSignals } from "./actions";

export const dynamic = "force-dynamic";

type SignalRow = {
  id: string;
  kind: string;
  source: string;
  channel: string | null;
  title: string;
  body: string | null;
  url: string | null;
  author: string | null;
  intent: string | null;
  status: string;
  lead_id: string | null;
  insight_id: string | null;
  demo: boolean;
  occurred_at: string | null;
  created_at: string;
};

const INTENT_STYLE: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-300",
  SELL: "bg-amber-500/15 text-amber-300",
  SERVICE: "bg-sky-500/15 text-sky-300",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Inbox",
  LEAD: "Converted to lead",
  INSIGHT: "Converted to insight",
  DISMISSED: "Dismissed",
};

function when(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export default async function SignalsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();

  const rowsRaw = await sql`
    select id, kind, source, channel, title, body, url, author, intent, status,
           lead_id, insight_id, demo, occurred_at, created_at
    from market_signals
    where organization_id = ${session.organizationId}
    order by coalesce(occurred_at, created_at) desc
    limit 50`;
  const rows = rowsRaw as unknown as SignalRow[];
  const inbox = rows.filter((r) => r.status === "NEW");
  const handled = rows.filter((r) => r.status !== "NEW");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Market Signals</h1>
        <p className="page-sub">Inbound market mentions and Google Business Profile activity land here.</p>
      </div>

      <section className="card p-6">
        <h2 className="section-title mb-2">How signals reach CUE</h2>
        <p className="muted text-sm">
          The ingest endpoints (<code className="text-cue-blue">/api/ingest/signals</code> and{" "}
          <code className="text-cue-blue">/api/ingest/google</code>) accept authenticated webhooks from social
          listening providers and GBP sync. Every signal is deduped, classified by intent (BUY / SELL / SERVICE —
          keyword rules first, your AI Ambassador key classifies the rest), and convertible into a lead or an
          insight with one click. New BUY-intent or urgent-service signals also ping your pilot-request inbox and devices.
        </p>
        <p className="muted mt-2 text-sm">
          Auth uses your org&apos;s ingest token (<code className="text-cue-blue">SIGNALS_INGEST_TOKEN</code>) in
          the <code className="text-cue-blue">x-cue-signals</code> header — set it in Vercel and hand it to your
          provider&apos;s webhook config — or any signed-in session.
        </p>
      </section>

      {rows.length === 0 && (
        <section className="card p-6 text-center">
          <p className="text-sm muted mb-4">
            No signals yet. Connect a provider in the Connected Ecosystem — or load three clearly-marked demo
            signals to try the classification and one-click conversion flows.
          </p>
          <form action={addDemoSignals}>
            <button className="btn-ghost">Add demo signals</button>
          </form>
        </section>
      )}

      {inbox.length > 0 && (
        <section className="card p-6">
          <h2 className="section-title mb-3">Signal inbox ({inbox.length})</h2>
          <ul className="divide-y divide-white/5">
            {inbox.map((s) => (
              <li key={s.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-white/10">{s.channel ?? s.source}</span>
                  {s.intent && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INTENT_STYLE[s.intent] ?? "bg-white/10"}`}>{s.intent}</span>}
                  {s.demo && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-fuchsia-500/15 text-fuchsia-300">DEMO</span>}
                  <span className="muted text-xs ml-auto">{when(s.occurred_at ?? s.created_at)}</span>
                </div>
                <p className="font-medium">{s.title}</p>
                {s.body && <p className="muted text-sm mt-0.5">{s.body.slice(0, 240)}{s.body.length > 240 ? "…" : ""}</p>}
                {s.author && <p className="muted text-xs mt-0.5">via {s.author}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <form action={convertSignalToLead}>
                    <input type="hidden" name="signalId" value={s.id} />
                    <button className="btn-ghost !px-3 !py-1.5 text-xs">→ Lead</button>
                  </form>
                  <form action={convertSignalToInsight}>
                    <input type="hidden" name="signalId" value={s.id} />
                    <button className="btn-ghost !px-3 !py-1.5 text-xs">→ Insight</button>
                  </form>
                  <form action={dismissSignal}>
                    <input type="hidden" name="signalId" value={s.id} />
                    <button className="btn-ghost !px-3 !py-1.5 text-xs">Dismiss</button>
                  </form>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">Open source ↗</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {handled.length > 0 && (
        <section className="card p-6">
          <h2 className="section-title mb-3">Worked ({handled.length})</h2>
          <ul className="divide-y divide-white/5">
            {handled.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-white/10">{s.channel ?? s.source}</span>
                  {s.intent && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INTENT_STYLE[s.intent] ?? "bg-white/10"}`}>{s.intent}</span>}
                  {s.demo && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-fuchsia-500/15 text-fuchsia-300">DEMO</span>}
                  <span className="muted text-xs">{STATUS_LABEL[s.status] ?? s.status}</span>
                  {s.status === "LEAD" && s.lead_id && (
                    <a href="/pipeline" className="text-cue-blue text-xs">View in Pipeline →</a>
                  )}
                  <span className="muted text-xs ml-auto">{when(s.occurred_at ?? s.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5">{s.title}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
