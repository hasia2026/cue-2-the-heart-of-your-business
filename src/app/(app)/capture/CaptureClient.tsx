"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureDocument } from "./actions";
import { useLocale } from "@/components/useLocale";

export default function CaptureClient() {
  const router = useRouter();
  const { t } = useLocale();
  const STEPS = [t("capture.s1"), t("capture.s2"), t("capture.s3"), t("capture.s4"), t("capture.s5")];
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  async function toggleRecording() {
    setVoiceError(null);
    if (recording) {
      mediaRef.current?.stop(); // onstop handler does the rest
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 2000) { setVoiceError(t("capture.voiceTooShort")); return; }
        setTranscribing(true);
        try {
          const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
          const fd = new FormData();
          fd.append("file", new File([blob], `voice-note.${ext}`, { type: blob.type }));
          const res = await fetch("/api/capture/transcribe", { method: "POST", body: fd });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || t("capture.voiceFailed"));
          const el = noteRef.current;
          if (el) el.value = (el.value ? el.value + "\n\n" : "") + j.text;
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : t("capture.voiceFailed"));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setVoiceError(t("capture.voiceDenied"));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDone(null);
    setFail(false);
    setStep(1);
    const fd = new FormData(e.currentTarget);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 320);
    try {
      const res = await captureDocument(fd);
      setStep(5);
      const tpl = res.tags.length ? t("capture.doneTags") : t("capture.donePlain");
      setDone(tpl.replace("{kind}", res.kind).replace("{tags}", res.tags.join(", ")));
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setFail(true);
      setDone(err instanceof Error ? err.message : t("capture.failed"));
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="section-title mb-1">{t("capture.bringTitle")}</h2>
      <p className="muted mb-4">
        {t("capture.bringSub")}
      </p>
      <form ref={formRef} onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="file">{t("capture.upload")}</label>
            <input id="file" name="file" type="file" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-cue-blue/20 file:px-3 file:py-1.5 file:text-sm file:text-white" />
          </div>
          <div>
            <label className="label" htmlFor="note">{t("capture.note")}</label>
            <textarea id="note" name="note" rows={3} ref={noteRef} className="input" placeholder={t("capture.notePlaceholder")} />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={toggleRecording} disabled={transcribing}
                className={`badge ${recording ? "badge-red" : "badge-blue"} cursor-pointer select-none`}>
                {recording ? "● " : "🎙 "}{transcribing ? t("capture.voiceTranscribing") : recording ? t("capture.voiceStop") : t("capture.voiceRecord")}
              </button>
              <span className="text-xs text-navy-300/70">{t("capture.voiceHint")}</span>
            </div>
            {voiceError && <p className="mt-1 text-xs text-red-300">{voiceError}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2 md:w-44">
          <button type="submit" disabled={busy} className="btn-primary">{busy ? t("capture.processing") : t("capture.button")}</button>
          <div className="text-xs text-navy-300/70">
            {t("capture.fileTypes")}
          </div>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`badge ${i < step ? "badge-green" : i === step && busy ? "badge-blue" : "badge-low"}`}>
              {i < step ? "✓" : i + 1} {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-xs text-navy-300/50">→</span>}
          </div>
        ))}
      </div>

      {done && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${fail ? "border-cue-red/30 bg-red-500/10 text-red-300" : "border-cue-green/30 bg-emerald-500/10 text-emerald-200"}`}>
          {done}
        </div>
      )}
    </section>
  );
}
