"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HousecallWebhookLogItem } from "@/lib/housecall-webhook";
import { replayHousecallWebhookEvent } from "./actions";

const STATUS_CLASS: Record<string, string> = {
  PROCESSED: "badge-green",
  SKIPPED: "badge-blue",
  FAILED: "badge-orange",
  REJECTED: "badge-orange",
  PROCESSING: "badge-blue",
  RECEIVED: "badge-blue",
};

function statusLabel(status: string): string {
  if (status === "NOT_CONFIGURED") return "TOKEN ONLY";
  return status.replace(/_/g, " ");
}

export default function HousecallWebhookLog({ events }: { events: HousecallWebhookLogItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function replay(event: HousecallWebhookLogItem) {
    setError(null);
    setNote(null);
    setActiveId(event.id);
    startTransition(async () => {
      const res = await replayHousecallWebhookEvent(event.id);
      setActiveId(null);
      if (!res.ok) {
        setError(res.error ?? "Replay failed.");
        return;
      }
      setNote(`Replayed ${event.eventName ?? event.providerEventId} — ${statusLabel(res.status ?? "PROCESSED")}.`);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-lg bg-white/[0.04] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-semibold text-navy-100">Webhook event log</div>
        <span className="text-[11px] text-navy-300/70">
          Raw deliveries are stored before normalization. Replays reuse the stored body and re-read the source record.
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-2 text-[11px] text-navy-300/70">No Housecall Pro deliveries logged yet.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {events.map((event) => {
            const replayable =
              event.status !== "REJECTED" &&
              event.status !== "PROCESSING" &&
              (event.signatureStatus === "VERIFIED" || event.signatureStatus === "NOT_CONFIGURED");
            const busy = pending && activeId === event.id;
            return (
              <div key={event.id} className="rounded-md border border-white/10 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-navy-100">
                    {event.eventName ?? "Unnamed event"}
                    {event.entityType ? ` · ${event.entityType}` : ""}
                    {event.entityExternalId ? ` ${event.entityExternalId}` : ""}
                  </span>
                  <span className={`badge ${STATUS_CLASS[event.status] ?? "badge-blue"}`}>
                    {statusLabel(event.status)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-navy-300/60">
                    {statusLabel(event.signatureStatus)}
                  </span>
                  <span className="ms-auto text-[10px] text-navy-300/60">
                    {new Date(event.receivedAt).toLocaleString()}
                    {event.attempts > 1 ? ` · ${event.attempts} attempts` : ""}
                    {event.replayed ? " · replayed" : ""}
                  </span>
                  {replayable && (
                    <button
                      type="button"
                      onClick={() => replay(event)}
                      disabled={pending}
                      className="btn-ghost !px-2 !py-0.5 text-[10px]"
                    >
                      {busy ? "Replaying…" : event.status === "PROCESSED" ? "Replay & reconcile" : "Replay"}
                    </button>
                  )}
                </div>
                {event.lastError && (
                  <div className="mt-1 break-words text-[10px] text-amber-300/90">{event.lastError}</div>
                )}
                <div className="mt-0.5 break-all text-[9px] text-navy-300/45">{event.providerEventId}</div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {note && <p className="mt-2 text-[11px] text-emerald-300">{note}</p>}
    </div>
  );
}
