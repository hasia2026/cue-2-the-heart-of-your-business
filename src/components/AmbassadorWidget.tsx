"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/components/useLocale";

type Msg = { role: "user" | "ambassador"; text: string; mode?: string };

const SPEECH_LANG: Record<string, string> = { en: "en-US", ar: "ar-SA", es: "es-ES", vi: "vi-VN" };

export default function AmbassadorWidget() {
  const { locale, rtl, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Voice input state: idle → recording → transcribing
  const [recState, setRecState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Speak an ambassador answer with the browser's built-in speechSynthesis (offline, zero cost)
  function speak(text: string, i: number) {
    if (!("speechSynthesis" in window)) return;
    if (speakingIdx === i) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[locale] ?? "en-US";
    u.onend = () => setSpeakingIdx(null);
    u.onerror = () => setSpeakingIdx(null);
    setSpeakingIdx(i);
    window.speechSynthesis.speak(u);
  }

  // Mic: record via MediaRecorder → transcribe with the live-tested Groq Whisper route → send
  async function startRec() {
    if (recState !== "idle" || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = chunks;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecState("transcribing");
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const form = new FormData();
          form.append("file", blob, "question.webm");
          const res = await fetch("/capture/transcribe", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.text) throw new Error(data.error || "fail");
          setRecState("idle");
          void send(data.text);
        } catch {
          setRecState("idle");
          setMsgs((m) => [...m, { role: "ambassador", text: t("amb.voiceFailed") }]);
        }
      };
      rec.start();
      setRecState("recording");
    } catch {
      setMsgs((m) => [...m, { role: "ambassador", text: t("amb.micDenied") }]);
    }
  }

  function stopRec() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    else if (recState === "transcribing") return; // wait for network call
  }

  // Tidy up: cancel recording + speech when the widget closes or unmounts
  useEffect(() => {
    if (open) return;
    if (recRef.current?.state === "recording") recRef.current.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingIdx(null);
  }, [open, speakingIdx]);
  useEffect(
    () => () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

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
                {m.role === "ambassador" && i > 0 && "speechSynthesis" in window && (
                  <button
                    onClick={() => speak(m.text, i)}
                    className={`mt-1.5 text-xs ${rtl ? "ml-1" : "mr-1"} ${speakingIdx === i ? "text-cyan-300" : "text-navy-300/60 hover:text-cyan-300"}`}
                    aria-label={speakingIdx === i ? t("amb.speakStop") : t("amb.speak")}
                    title={speakingIdx === i ? t("amb.speakStop") : t("amb.speak")}
                  >
                    {speakingIdx === i ? "🔊" : "🔈"}
                  </button>
                )}
              </div>
            ))}
            {busy && <div className="animate-pulse text-xs text-violet-300">🦋 {t("amb.thinking")}</div>}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(["amb.s1", "amb.s2", "amb.s3", "amb.s4", "amb.s5"] as const).map((k) => (
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
              {recState !== "idle" ? (
                <button
                  type="button"
                  onClick={stopRec}
                  className={`!px-3 ${recState === "recording" ? "bg-red-600/80 text-white rounded-xl animate-pulse" : ""} border border-white/20 rounded-xl`}
                  aria-label={recState === "recording" ? t("amb.voiceStop") : t("amb.voiceTranscribing")}
                  title={recState === "recording" ? t("amb.voiceStop") : t("amb.voiceTranscribing")}
                >
                  {recState === "recording" ? "■ " : "⏳ "}🎙
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRec}
                  className="!px-3 border border-white/20 rounded-xl hover:bg-white/[0.08]"
                  aria-label={t("amb.voice")}
                  title={t("amb.voice")}
                >
                  🎙
                </button>
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={recState === "recording" ? t("amb.voiceStop") : t("amb.placeholder")}
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
