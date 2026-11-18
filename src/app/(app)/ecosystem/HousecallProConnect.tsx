"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WebhookToken from "./WebhookToken";
import HousecallWebhookLog from "./HousecallWebhookLog";
import { connectHousecallPro, disconnectHousecallPro, saveHousecallSigningSecret, syncHousecallProNow } from "./actions";
import type { HousecallWebhookLogItem } from "@/lib/housecall-webhook";

const DOCS = "https://docs.housecallpro.com/";
const KEYS = "https://help.housecallpro.com/en/articles/8505035-api-overview";

export default function HousecallProConnect({
  saved,
  accountName,
  lastSyncAt,
  maskedUrl,
  signingSecretSaved,
  events,
}: {
  saved: boolean;
  accountName: string | null;
  lastSyncAt: string | null;
  maskedUrl: string | null;
  signingSecretSaved: boolean;
  events: HousecallWebhookLogItem[];
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [signingSecret, setSigningSecret] = useState("");
  const [signingConfigured, setSigningConfigured] = useState(signingSecretSaved);

  async function connect() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await connectHousecallPro(key);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not connect Housecall Pro.");
      return;
    }
    setKey("");
    setReplace(false);
    setNote(`Connected${res.account ? ` to ${res.account}` : ""}. Run a sync to pull records.`);
    router.refresh();
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await syncHousecallProNow();
    setBusy(false);
    if (!res.ok || !res.counts) {
      setError(res.error ?? "Sync failed.");
      return;
    }
    setNote(`Synced ${res.counts.customers} customers, ${res.counts.jobs} jobs, ${res.counts.appointments} appointments and ${res.counts.invoices} invoices.`);
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect Housecall Pro? Synced records stay in CUE; future syncs stop.")) return;
    setBusy(true);
    setError(null);
    const res = await disconnectHousecallPro();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not disconnect.");
    else {
      setNote("Disconnected. Records already synced remain available in Field Ops.");
      router.refresh();
    }
  }

  async function saveSecret(value: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await saveHousecallSigningSecret(value);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save the signing secret.");
      return;
    }
    setSigningSecret("");
    setSigningConfigured(Boolean(res.configured));
    setNote(res.configured
      ? "Signing secret saved. New deliveries must pass Api-Signature verification."
      : "Signing secret cleared. The webhook falls back to its URL token.");
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.04] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-cyan-200">Field-service connector</span>
        {saved && <span className="badge-green">KEY SAVED</span>}
        <a href={DOCS} target="_blank" rel="noreferrer" className="ms-auto text-cyan-300 hover:underline">API docs ↗</a>
      </div>

      {saved ? (
        <div className="mt-2 space-y-2">
          <div className="text-navy-100">
            Connected{accountName ? ` as ${accountName}` : ""}
            {lastSyncAt ? ` · last sync ${new Date(lastSyncAt).toLocaleString()}` : " · no sync yet"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sync} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs">
              {busy ? "Working…" : "Sync customers, jobs, appointments & invoices"}
            </button>
            <button type="button" onClick={() => setReplace((v) => !v)} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs">
              {replace ? "Cancel" : "Replace key"}
            </button>
            <button type="button" onClick={disconnect} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs">
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-navy-300">
          Pull customers, jobs, appointments and invoices into CUE. Generate a company API key in Housecall Pro →{" "}
          <a href={KEYS} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">API overview ↗</a>.
          CUE layers Field Ops and revenue recovery on top — it does not replace dispatch.
        </p>
      )}

      {saved && (
        <p className="mt-2 text-navy-300/70">
          Visits link to their Housecall Pro job. A visit is counted as confirmed only when
          Housecall Pro explicitly reports it as confirmed; a scheduled job alone is not enough.
        </p>
      )}

      {(!saved || replace) && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Housecall Pro company API key"
            autoComplete="off"
            className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/60"
          />
          <button type="button" onClick={connect} disabled={busy || !key.trim()} className="btn-primary !px-3 !py-1.5 text-xs">
            {busy ? "Testing…" : "Save & test"}
          </button>
        </div>
      )}

      {maskedUrl && (
        <div className="mt-3 rounded-lg bg-white/[0.04] p-2.5">
          <div className="font-semibold text-navy-100">Webhook URL — paste into Housecall Pro</div>
          <WebhookToken integrationKey="housecall_pro" maskedUrl={maskedUrl} />
          <div className="mt-1 text-navy-300/70">
            Job, appointment, customer and invoice events land in the same tables as the pull sync. The URL is the credential — keep it private.
          </div>
        </div>
      )}

      {maskedUrl && (
        <div className="mt-3 rounded-lg bg-white/[0.04] p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-navy-100">Webhook signing secret</div>
            <span className={signingConfigured ? "badge-green" : "badge-orange"}>
              {signingConfigured ? "SIGNATURE VERIFIED" : "TOKEN ONLY"}
            </span>
          </div>
          <p className="mt-1 text-navy-300/70">
            Paste the signing secret from the Housecall Pro webhook settings. Once saved, every delivery must
            present a valid <code>Api-Timestamp</code> and <code>Api-Signature</code>.
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <input
              type="password"
              value={signingSecret}
              onChange={(e) => setSigningSecret(e.target.value)}
              placeholder="Housecall Pro webhook signing secret"
              autoComplete="off"
              className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400/60"
            />
            <button
              type="button"
              onClick={() => saveSecret(signingSecret)}
              disabled={busy || !signingSecret.trim()}
              className="btn-primary !px-3 !py-1.5 text-xs"
            >
              {busy ? "Saving…" : signingConfigured ? "Replace secret" : "Save secret"}
            </button>
            {signingConfigured && (
              <button
                type="button"
                onClick={() => saveSecret("")}
                disabled={busy}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {maskedUrl && <HousecallWebhookLog events={events} />}

      {error && <p className="mt-2 text-red-300">{error}</p>}
      {note && <p className="mt-2 text-emerald-300">{note}</p>}
    </div>
  );
}