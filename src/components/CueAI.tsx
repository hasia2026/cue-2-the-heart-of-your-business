"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; sources?: { label: string; kind: string }[]; suggested?: { label: string; href: string }[] };

export default function CUEAI({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi — I'm CUE AI. I answer from your company's actual records, and I'll tell you plainly when I don't know something. Try: “What should I focus on today?” or “What's our refund policy?”",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer ?? "Something went wrong.", sources: data.sources, suggested: data.suggested },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I couldn't reach the CUE intelligence layer just now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer max-w-md flex flex-col" role="dialog" aria-label="CUE AI">
        <div className="sticky top-0 bg-gradient-to-r from-accent-blue/80 to-accent-purple/80 text-white px-5 py-4 flex items-center gap-3 border-b border-navy-100">
          <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center text-lg">✦</div>
          <div>
            <div className="font-semibold leading-tight">CUE AI</div>
            <div className="text-xs text-white/80">Grounded in your company's data — never invented</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/90 hover:text-white text-lg" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-accent-blue text-white"
                    : "bg-white/[0.05] text-navy-800 border border-navy-100"
                }`}
              >
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t border-navy-200/60 pt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 mb-1">Sources</div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((s, j) => (
                        <span key={j} className="badge-low">❑ {s.label}</span>
                      ))}
                    </div>
                  </div>
                )}
                {m.suggested && m.suggested.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.suggested.map((s, j) => (
                      <a key={j} href={s.href} onClick={onClose} className="btn-secondary btn-sm">{s.label} →</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="rounded-2xl bg-navy-50 px-4 py-3 text-sm text-navy-500 animate-pulse max-w-[85%]">
              Checking your records…
            </div>
          )}
        </div>

        <div className="border-t border-navy-100 p-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["What should I focus on today?", "What's happening with sales?", "What's our refund policy?"].map((s) => (
              <button key={s} onClick={() => send(s)} className="badge-low hover:bg-navy-100 transition-colors">{s}</button>
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
              className="input flex-1"
              placeholder="Ask about your business…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading || !input.trim()} className="btn-primary">Ask</button>
          </form>
        </div>
      </div>
    </div>
  );
}
