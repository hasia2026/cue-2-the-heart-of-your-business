"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/components/useLocale";

type Msg = { role: "user" | "ambassador"; text: string; mode?: string };

export type AmbassadorPersona = {
  name: string;
  avatar: string;
  greeting: string | null;
  tone: string | null;
};

const SPEECH_LANG: Record<string, string> = { en: "en-US", ar: "ar-SA", es: "es-ES", vi: "vi-VN" };
const AUTO_SPEAK_KEY = "cue-amb-auto-speak";

export default function AmbassadorWidget({
  persona = { name: "AI Ambassador", avatar: "🦋", greeting: null, tone: null },
}: {
  persona?: AmbassadorPersona;
} = {}) {
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

  // Auto-speak preference — persists across visits in localStorage
  const [autoSpeak, setAutoSpeak] = useState(false);
  useEffect(() => {
    try {
      setAutoSpeak(localStorage.getItem(AUTO_SPEAK_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  // Instantly stop any speech (barge-in / cleanup)
  const stopSpeaking = useRef(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingIdx(null);
  });

  // Speech text: TTS must never narrate symbols ("**", "/", "—", "|").
  // Whitelist approach — keep letters (any script: en/es/vi/ar), digits, and
  // real sentence punctuation; drop everything symbol-like. URLs and markdown
  // links get humanized first so labels survive the whitelist.
  function speakableText(raw: string): string {
    return raw
      .replace(/https?:\/\/\S+/g, " a link. ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) → label
      .replace(/[*_`#>~]+/g, " ")               // markdown syntax noise (**, __, `)
      .replace(/^\s*[-•]\s+/gm, "")             // leading bullet dashes
      .replace(/[^\p{L}\p{N}\s.,?!'’%$-]/gu, " ") // drop / \ | — ( ) [ ] = etc.
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Speak an ambassador answer with the browser's built-in speechSynthesis (offline, zero cost)
  function speak(text: string, i: number) {
    if (!("speechSynthesis" in window)) return;
    if (speakingIdx === i) {
      stopSpeaking.current();
      return;
    }
    stopSpeaking.current();
    const u = new SpeechSynthesisUtterance(speakableText(text));
    u.lang = SPEECH_LANG[locale] ?? "en-US";
    u.onend = stopSpeaking.current;
    u.onerror = stopSpeaking.current;
    setSpeakingIdx(i);
    window.speechSynthesis.speak(u);
  }

  // Auto-speak freshly answered ambassador messages
  useEffect(() => {
    if (!autoSpeak || !("speechSynthesis" in window)) return;
    const last = msgs[msgs.length - 1];
    if (last && last.role === "ambassador" && msgs.length > 1) {
      const i = msgs.length - 1;
      const u = new SpeechSynthesisUtterance(speakableText(last.text));
      u.lang = SPEECH_LANG[locale] ?? "en-US";
      u.onend = () => setSpeakingIdx((cur) => (cur === i ? null : cur));
      u.onerror = () => setSpeakingIdx((cur) => (cur === i ? null : cur));
      setSpeakingIdx(i);
      window.speechSynthesis.speak(u);
    }
  }, [msgs, autoSpeak, locale]);

  // Mic: record via MediaRecorder → transcribe with the live-tested Groq Whisper route → send.
  // micPending covers the browser permission prompt: from getUserMedia call to
  // resolve/reject. Rejections distinguish the denied/blocked case (NotAllowed/
  // Security errors) from generic failures (NotFoundError, syscall errors).
  const [micPending, setMicPending] = useState(false);

  async function beginRecording() {
    if (recState !== "idle" || micPending || busy) return;
    stopSpeaking.current(); // barging in while speech plays
    setMicPending(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPending(false);
      startMeter(stream);
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = chunks;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        stopMeter();
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
    } catch (e) {
      setMicPending(false);
      stopMeter();
      // NotAllowed → user denied or site policy blocks; NotFound/other → no mic or driver error.
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setMsgs((m) => [...m, { role: "ambassador", text: denied ? t("amb.micDeniedHard") : t("amb.micDenied") }]);
    }
  }

  // Live input feedback: a 7-bar amplitude meter fed from the real mic stream.
  // Cheap AnalyserNode polling (no oscillation, no re-renders beyond the meter).
  const [micLevel, setMicLevel] = useState(0); // 0..1
  const meterRaf = useRef(0);
  const meterCtx = useRef<AudioContext | null>(null);

  function startMeter(stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      meterCtx.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setMicLevel(Math.min(1, (sum / data.length) / 96));
        meterRaf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Meter failure must never break the recording itself.
    }
  }

  function stopMeter() {
    cancelAnimationFrame(meterRaf.current);
    meterCtx.current?.close().catch(() => {});
    meterCtx.current = null;
    setMicLevel(0);
  }

  function stopRec() {
    if (recRef.current?.state === "recording") recRef.current.stop();
    else if (recState === "transcribing") return; // wait for network call
  }

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    stopSpeaking.current(); // barge-in: new message kills speech instantly
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

  // Tidy up: cancel recording + speech when the widget closes or unmounts
  useEffect(() => {
    if (open) return;
    if (recRef.current?.state === "recording") recRef.current.stop();
    stopSpeaking.current();
  }, [open]);
  useEffect(
    () => () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  // Seed the greeting in the current language (re-seeds if language changes).
  // Owner-custom persona takes precedence; the localized stock greeting is the fallback.
  useEffect(() => {
    stopSpeaking.current();
    setMsgs([
      {
        role: "ambassador",
        text: persona.greeting?.trim()
          ? persona.greeting.trim()
          : t("amb.greeting"),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, persona.greeting]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  // Hold-to-talk on mobile: pointerdown starts, pointerup stops + sends
  const holdRef = useRef<{ timer: number | null }>({ timer: null });
  function holdStart() {
    if (recState !== "idle") return;
    if (holdRef.current.timer) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current.timer = null;
    }
    // small press threshold so an accidental tap doesn't open the mic
    holdRef.current.timer = window.setTimeout(() => {
      holdRef.current.timer = null;
      void beginRecording();
    }, 250);
  }
  function holdEnd() {
    if (holdRef.current.timer) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current.timer = null;
      return; // was just a tap — ignore
    }
    stopRec();
  }

  function toggleAutoSpeak() {
    const next = !autoSpeak;
    setAutoSpeak(next);
    if (!next) stopSpeaking.current();
    try {
      localStorage.setItem(AUTO_SPEAK_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
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
          <span aria-hidden>{persona.avatar}</span>
        </button>
      )}

      {open && (
        <div
          className={`fixed bottom-5 z-50 flex h-[min(600px,88vh)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl border border-violet-400/30 bg-ink-900/97 shadow-glow backdrop-blur ${
            rtl ? "left-5" : "right-5"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-violet-600/30 to-cyan-500/20 px-4 py-3">
            <span className="cue-halo inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20 text-xl">{persona.avatar}</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{persona.name}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-violet-300/80">
                {busy ? t("amb.busy") : t("amb.online")}
              </div>
            </div>
            {/* Auto-speak preference — remembered across visits */}
            <button
              onClick={toggleAutoSpeak}
              className={`!px-2 !py-1 rounded-full text-xs transition border ${
                autoSpeak ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200" : "border-white/20 bg-white/[0.04] text-navy-300"
              }`}
              aria-pressed={autoSpeak}
              aria-label={`${t("amb.speak")}: ${autoSpeak ? "on" : "off"}`}
              title={`${t("amb.speak")} — ${autoSpeak ? "ON (tap to stop)" : "off (tap to start)"}`}
            >
              🔊 {autoSpeak ? "✓" : ""}
            </button>
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
            {busy && <div className="animate-pulse text-xs text-violet-300">{persona.avatar} {t("amb.thinking")}</div>}
          </div>

          {/* Mobile hold-to-talk — big mic under the message list on small screens */}
          <div className="border-t border-white/10 p-3 md:min-h-[ unset]">
            {/* big hold-to-talk button — small screens only */}
            <div className="mb-2 flex justify-center lg:hidden">
              {recState === "idle" ? (
                <button
                  type="button"
                  onPointerDown={holdStart}
                  onPointerUp={holdEnd}
                  onPointerCancel={holdEnd}
                  onPointerLeave={holdEnd}
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-violet-600/30 text-2xl text-white active:scale-95 active:bg-violet-500/50 transition ${
                    holdRef.current.timer ? "animate-pulse" : ""
                  }`}
                  aria-label={t("amb.voice")}
                  title={t("amb.voice")}
                >
                  🎙
                </button>
              ) : (
                <button
                  type="button"
                  onPointerUp={holdEnd}
                  onPointerCancel={holdEnd}
                  className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white transition ${
                    recState === "recording"
                      ? "animate-pulse border-2 border-red-400/60 bg-red-600/70"
                      : "border-2 border-cyan-400/40 bg-cyan-500/30"
                  }`}
                  aria-label={recState === "recording" ? t("amb.voiceStop") : t("amb.voiceTranscribing")}
                  title={recState === "recording" ? t("amb.voiceStop") : t("amb.voiceTranscribing")}
                >
                  {recState === "recording" ? "■" : "⏳"}
                </button>
              )}
            </div>

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
              <button
                type="button"
                onClick={recState !== "idle" ? stopRec : beginRecording}
                className={`!px-3 border border-white/20 rounded-xl hover:bg-white/[0.08] ${
                  recState === "recording" ? "animate-pulse bg-red-600/80 text-white" : micPending ? "animate-pulse" : ""
                }`}
                aria-label={recState !== "idle" ? t("amb.voiceStop") : micPending ? t("amb.micAsk") : t("amb.voice")}
                title={recState !== "idle" ? t("amb.voiceStop") : micPending ? t("amb.micAsk") : t("amb.voice")}
              >
                {recState === "recording" ? "■" : recState === "transcribing" ? "⏳" : micPending ? "⏳" : "🎙"}
              </button>
              {recState === "recording" && (
                <div aria-hidden className="flex h-6 items-end gap-[2px] !px-0 rounded-lg bg-white/[0.06] px-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    // Bell-shaped envelope so the bars read as a meter, and each
                    // bar's height follows the live input with a little variance.
                    const wobble = ((micLevel * 96) * Math.abs(Math.sin(Date.now() / 220 + i))) % 24;
                    const h = Math.max(3, Math.min(24, micLevel * 24 * Math.sin(Math.PI * ((i + 1) / 8)) + wobble * 0.35));
                    return <span key={i} className="w-[3px] rounded-full bg-cyan-300" style={{ height: `${h}px` }} />;
                  })}
                </div>
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  recState === "recording"
                    ? t("amb.voiceStop")
                    : micPending
                      ? t("amb.micAsk")
                      : t("amb.placeholder")
                }
                className="input flex-1"
                aria-label={t("amb.placeholder")}
              />
              <button onClick={() => send()} className="btn-primary !px-4" disabled={busy}>→</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
