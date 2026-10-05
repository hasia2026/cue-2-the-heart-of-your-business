import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  await requireSession();
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
          listening providers and GBP sync. Every signal is deduped, classified by intent (BUY / SELL / SERVICE),
          and convertible into a lead or an insight with one click.
        </p>
        <p className="muted mt-3 text-sm">
          Connect a provider in the Connected Ecosystem to start the flow — demo sources are clearly marked.
        </p>
      </section>
    </div>
  );
}
