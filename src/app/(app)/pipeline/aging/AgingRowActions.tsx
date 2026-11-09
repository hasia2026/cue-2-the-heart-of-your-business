"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkOffInvoiceChase,
  restoreInvoiceChase,
  previewInvoiceReminder,
  sendInvoiceReminder,
} from "./actions";

// Row controls for the overdue-aging drill-down.
//   • "✓ Checked off" / "↺ Restore" writes the same suggested_order_dismissals
//     row the Intake card uses, so the chase disappears from the card and the
//     weekly digest as well — one list, one truth.
//   • "Send reminder" (30+ days only) is draft-first: the first click shows the
//     exact AR cadence template that would go out (in the customer's language);
//     nothing is delivered until "Send now".
export default function AgingRowActions({
  invoiceId,
  dismissalId,
  canRemind,
  stale,
}: {
  invoiceId: string;
  dismissalId: string | null;
  canRemind: boolean;
  stale: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"dismiss" | "restore" | "preview" | "send" | null>(null);
  const [draft, setDraft] = useState<{ customerName: string; locale: string; total: number; text: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function dismiss() {
    setBusy("dismiss");
    setMsg(null);
    try {
      await checkOffInvoiceChase(invoiceId);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!dismissalId) return;
    setBusy("restore");
    setMsg(null);
    try {
      await restoreInvoiceChase(dismissalId);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    setBusy("preview");
    setMsg(null);
    try {
      const r = await previewInvoiceReminder(invoiceId);
      if (!r.ok || !r.draft) {
        setMsg(r.message ?? "Could not draft a reminder.");
        return;
      }
      setDraft(r.draft);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setMsg(null);
    try {
      const r = await sendInvoiceReminder(invoiceId);
      setMsg(r.message);
      if (r.ok) setDraft(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {dismissalId ? (
          <>
            <span className="badge-green">✓ chase checked off</span>
            <button
              type="button"
              onClick={() => void restore()}
              disabled={busy !== null}
              className="btn-ghost !px-2 !py-0.5 text-[11px]"
              title="Restore this chase — it wasn't handled after all"
            >
              {busy === "restore" ? "Restoring…" : "↺ Restore"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={busy !== null}
            className="btn-ghost !px-2 !py-0.5 text-[11px]"
            title="Chase done — hide this invoice from the card, digest and worklist"
          >
            {busy === "dismiss" ? "Saving…" : "✓ Check off chase"}
          </button>
        )}
        {stale && !dismissalId && canRemind && (
          <button
            type="button"
            onClick={() => void preview()}
            disabled={busy !== null}
            className="btn-ghost !px-2 !py-0.5 text-[11px] text-orange-300"
            title="Draft a payment reminder for this invoice using the AR cadence template"
          >
            {busy === "preview" ? "Drafting…" : "✉ Send reminder"}
          </button>
        )}
      </div>

      {draft && (
        <div className="mt-2 rounded-lg border border-orange-400/25 bg-orange-500/5 p-2.5">
          <p className="text-[11px] text-navy-200">
            Draft for {draft.customerName} <span className="badge-low ms-1">{draft.locale}</span>
            <span className="muted"> · ${Math.round(draft.total).toLocaleString("en-US")}</span>
          </p>
          <pre className="mt-1.5 whitespace-pre-wrap text-[11px] text-navy-300">{draft.text}</pre>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy !== null}
              className="btn-primary !px-2.5 !py-1 text-[11px]"
            >
              {busy === "send" ? "Sending…" : "Send now"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={busy !== null}
              className="btn-ghost !px-2.5 !py-1 text-[11px]"
            >
              Cancel
            </button>
            <span className="muted text-[11px]">WhatsApp when a number is on file, email otherwise.</span>
          </div>
        </div>
      )}

      {msg && <p className="mt-1.5 text-[11px] text-navy-200">{msg}</p>}
    </div>
  );
}
