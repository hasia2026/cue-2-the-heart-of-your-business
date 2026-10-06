"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/components/useLocale";

type Msg = { role: "user" | "ambassador"; text: string; mode?: string };

export default function AmbassadorWidget() {
  const { locale, rtl, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Seed the greeting in the current language (re-seeds if language changes)
  useEffect(() => {
    setMsgs([{ role: "ambassador", text: t("amb.greeting") }]);
  }, [locale]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ambassador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, locale }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "ambassador", text: data.answer ?? data.error ?? "…", mode: data.mode },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "ambassador", text: rtl ? "مشكلة في الشبكة — حاول مرة أخرى." : "Network hiccup — try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={rtl ? "rtl" : "ltr"} lang={locale} className={rtl ? "text-right" : undefined}>
      {/* Floating launcher — bottom right (bottom-left when RTL) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`cue-halo fixed bottom-5 z-50 flex h-16 w-16 items-center justify-center rounded-full btn-primary !p-0 text-2xl ${
            rtl ? "left-5" : "right-5"
          }`}
          aria-label={t("amb.open")}
        >
          <span aria-hidden>🦋</span>
        </button>
      )}

      {open && (
        <div
          className={`fixed bottom-5 z-50 flex h-[560px] w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl border border-violet-400/30 bg-ink-900/97 shadow-glow backdrop-blur ${
            rtl ? "left-5" : "right-5"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-violet-600/30 to-cyan-500/20 px-4 py-3">
            <span className="cue-halo inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20 text-xl">🦋</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{t("amb.title")}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-violet-300/80">
                {busy ? t("amb.busy") : t("amb.online")}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-navy-300 hover:text-white text-lg" aria-label={t("amb.close")}>✕</button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? `bg-gradient-to-r from-violet-600/40 to-violet-500/30 text-white ${rtl ? "me-auto" : "ms-auto"}`
                    : "bg-white/[0.06] text-navy-100"
                }`}
              >
                {m.text}
                {m.mode === "grounded" && (
                  <div className="mt-1.5 text-[10px] uppercase tracking-wider text-navy-300/60">{t("amb.fromRecords")}</div>
                )}
              </div>
            ))}
            {busy && <div className="animate-pulse text-xs text-violet-300">🦋 {t("amb.thinking")}</div>}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(["amb.s1", "amb.s2", "amb.s3", "amb.s4"] as const).map((k) => (
                <button key={k} onClick={() => send(t(k))} className="badge-low hover:bg-white/[0.1] !normal-case !text-xs">
                  {t(k)}
                </button>
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
                placeholder={t("amb.placeholder")}
                className="input flex-1"
                aria-label={t("amb.placeholder")}
              />
              <button className="btn-primary !px-4" disabled={busy}>→</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
