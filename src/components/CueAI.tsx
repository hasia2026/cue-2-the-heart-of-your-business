"use client";

import { useState } from "react";

type Msg = { role: "user" | "cue"; text: string };

export default function CueAI() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "cue",
      text: "Hi — I'm CUE AI. I answer from your actual business records, and I'll tell you plainly when I don't know. Try: “What should I focus on today?”",
    },
  ]);
  const [busy, setBusy] = useState(false);

  // Mascot states: idle → scanning → found something (mirrors the Revi brand book)
  const state = open ? (busy ? "scanning" : "active") : "idle";
  const mascot = {
    idle: { glyph: "✦", pulse: "" },
    scanning: { glyph: "◐", pulse: "animate-pulse" },
    active: { glyph: "✦", pulse: "" },
  }[state] ?? { glyph: "✦", pulse: "" };

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMsgs((m) => [...m, { role: "cue", text: data.answer ?? data.error ?? "…" }]);
    } catch {
      setMsgs((m) => [...m, { role: "cue", text: "Network hiccup — try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary !px-3 !py-1.5 text-xs" aria-label="Open CUE AI">
        <span className={mascot.pulse}>{mascot.glyph}</span> CUE AI
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col border-s border-white/10 bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold text-white">
                <span className={`text-cue-purple ${mascot.pulse}`}>{mascot.glyph}</span>
                CUE AI
                {busy && <span className="text-xs font-normal text-navy-300">checking the records…</span>}
              </div>
              <button onClick={() => setOpen(false)} className="text-navy-300 hover:text-white" aria-label="Close">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === "user"
                      ? "ms-auto bg-cue-blue/20 text-white"
                      : "bg-white/[0.05] text-navy-100"
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {busy && <div className="text-xs text-navy-300">CUE is checking the records…</div>}
            </div>
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["What should I focus on today?", "What's unbilled in service?", "Which leads need follow-up?"].map((s) => (
                  <button key={s} onClick={() => send(s)} className="badge-low hover:bg-white/[0.1]">{s}</button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex gap-2"
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ask about your business…"
                  className="input"
                />
                <button className="btn-primary !px-3" disabled={busy}>→</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
