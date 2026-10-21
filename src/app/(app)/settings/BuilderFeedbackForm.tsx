"use client";

import { useState, useTransition } from "react";
import { sendBuilderFeedback } from "./feedback-actions";

// "Message the builder" — pinned for every role. Feature request or issue,
// one box, no ceremony. Confirmations are inline; nothing leaves the page.
export default function BuilderFeedbackForm({ userName }: { userName: string }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"FEATURE" | "ISSUE">("FEATURE");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !message.trim()) return;
    const fd = new FormData();
    fd.set("message", message);
    fd.set("kind", kind);
    fd.set("page", page);
    startTransition(async () => {
      const r = await sendBuilderFeedback(fd);
      if (r.ok) {
        setMessage("");
        setPage("");
        setMsg({ text: "Sent ✓ — thanks, it's logged and I read every one. — Revi", ok: true });
        setTimeout(() => setMsg(null), 6000);
      } else {
        setMsg({ text: r.error ?? "Failed to send", ok: false });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input type="radio" checked={kind === "FEATURE"} onChange={() => setKind("FEATURE")} />
          <span>Feature request</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input type="radio" checked={kind === "ISSUE"} onChange={() => setKind("ISSUE")} />
          <span>Something's broken</span>
        </label>
      </div>
      <textarea
        aria-label="Message the builder"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={kind === "FEATURE"
          ? "What should CUE do that it doesn't? The more concrete the job-to-be-done, the faster it lands."
          : "What happened, what page were you on, what did you expect?"}
        className="input"
      />
      <input
        aria-label="Which page (optional)"
        value={page}
        onChange={(e) => setPage(e.target.value)}
        placeholder="Which page were you on? (optional)
"
        className="input !py-1.5 text-xs"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !message.trim()} className="btn-primary">
          {pending ? "Sending…" : "Send to the builder"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
      </div>
      <p className="muted text-xs">Signed as {userName} — goes straight to the builder with your org attached. No support queue, no ticket bot.</p>
    </form>
  );
}
