"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { draftOrderInvoice, markOrderCompleted } from "./service-actions";

type Props = {
  orderId: string;
  status: string;
  /** Draft-invoice number already attached to this order (non-VOID), if any. */
  draftNumber: string | null;
  canEdit: boolean;
  /** Rendered review-and-release control for the draft (page composes it). */
  draftSlot?: React.ReactNode | null;
};

/**
 * Money-facing service-order actions, all draft-first. "Mark done" closes the
 * visit and CUE immediately prepares a draft quote (owner still sends, per
 * the org's own SOP window). "Draft invoice" does the same manually for jobs
 * that finished before the button existed. Nothing here can send or mutate
 * an issued invoice.
 */
export default function OrderActions({ orderId, status, draftNumber, draftSlot, canEdit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"draft" | "complete" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(draftNumber);
  const [stage, setStage] = useState<string>(status);

  async function run(kind: "draft" | "complete") {
    setBusy(kind);
    setMsg(null);
    try {
      const res = kind === "draft"
        ? await draftOrderInvoice(orderId)
        : await markOrderCompleted(orderId);
      const body = res as { ok?: boolean; number?: string; draftNumber?: string; error?: string; skipped?: string; amount?: string };
      if (!res.ok) {
        setMsg(body.error ?? "Something went wrong");
        // Honest completion even when the draft step skipped: the job IS done.
        if (kind === "complete" && body.skipped === "DRAFT_EXISTS") {
          setStage("COMPLETED");
        }
        return;
      }
      if (kind === "complete") {
        setStage("COMPLETED");
        setMsg(body.draftNumber
          ? `Draft invoice ${body.draftNumber} prepared — review and send from Pipeline.`
          : "Marked done. A draft quote already exists — send it when ready.");
      } else {
        setMsg(body.number ?? "Draft prepared");
      }
      setDraft(body.draftNumber ?? body.number ?? null);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!canEdit) return null;
  const completed = stage === "COMPLETED";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      {completed && !draft && (
        <button onClick={() => run("draft")} disabled={busy !== null} className="btn-primary !py-1 !px-2.5 text-xs">
          {busy === "draft" ? "Preparing…" : "Draft invoice"}
        </button>
      )}
      {!completed && (
        <button onClick={() => run("complete")} disabled={busy !== null} className="btn-ghost !py-1 !px-2.5 text-xs">
          {busy === "complete" ? "Closing…" : "Mark done"}
        </button>
      )}
      {draft && draftSlot}
      {draft && !draftSlot && (
        <span className="text-xs text-navy-300">Draft {draft} ready — send it from “Send a localized quote” above.</span>
      )}
      {msg && <span className="text-xs text-navy-300">{msg}</span>}
    </div>
  );
}
