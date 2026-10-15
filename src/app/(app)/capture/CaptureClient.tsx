"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureDocument, applyOcrText } from "./actions";
import { readImageOnDevice } from "@/lib/tesseract-client";

const OCR_SETUP_HINT = "For the most accurate extraction, save a Groq API key in Settings → AI Ambassador (or GROQ_API_KEY server-side) — CUE then reads it with a vision model. The free on-device OCR stays available either way.";
import { useLocale } from "@/components/useLocale";

export default function CaptureClient() {
  const router = useRouter();
  const { t } = useLocale();
  const STEPS = [t("capture.s1"), t("capture.s2"), t("capture.s3"), t("capture.s4"), t("capture.s5")];
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickedFileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [extractChoice, setExtractChoice] = useState<"ask" | "extract" | "save">("ask");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [dup, setDup] = useState<{ docId: string; title: string; uploadedAt: string; how: string } | null>(null);
  const lastFdRef = useRef<FormData | null>(null);

  async function runCapture(fd: FormData) {
    setBusy(true);
    setDone(null);
    setFail(false);
    setDup(null);
    setStep(1);
    pickedFileRef.current = fileRef.current?.files?.[0] ?? null;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 320);
    try {
      const res = await captureDocument(fd);
      if (res.duplicate) {
        // Duplicate detector: same content already captured — show the match
        // and let the user confirm or cancel.
        setDup(res.duplicate);
        lastFdRef.current = fd;
        return;
      }
      setStep(5);
      const folder = res.folder ? `, filed to ${res.folder}` : "";
      const tpl = res.tags.length ? t("capture.doneTags") : t("capture.donePlain");
      let msg = tpl.replace("{kind}", res.kind).replace("{tags}", res.tags.join(", ")) + folder;
      if (res.needsOcr) {
        msg = `Image saved to ${res.folder ?? "Images & Media"}. Want CUE to read the text and file it?`;
        setPendingDocId(res.docId);
        setOcrError(null);
      } else {
        setPendingDocId(null);
      }
      setDone(msg);
      formRef.current?.reset();
      setIsImage(false);
      setExtractChoice("ask");
      router.refresh();
    } catch (err) {
      setFail(true);
      setDone(err instanceof Error ? err.message : t("capture.failed"));
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    if (isImage) fd.set("extract", extractChoice === "extract" ? "1" : "0");
    fd.delete("ignoreDuplicate");
    await runCapture(fd);
  }

  async function saveAnyway() {
    if (busy) return;
    const prev = lastFdRef.current;
    if (!prev) { setDup(null); return; }
    // Copy the original payload (FormData isn't cloneable via constructor)
    // and flag past the duplicate gate.
    const fd = new FormData();
    prev.forEach((v, k) => {
      if (k !== "imgextract") fd.append(k, v);
    });
    fd.set("ignoreDuplicate", "1");
    await runCapture(fd);
  }

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
          const res = await fetch("/capture/transcribe", { method: "POST", body: fd });
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

  // Fallback chain: (1) server vision OCR — per-org Groq key or the server
  // GROQ_API_KEY; (2) if no key is configured (503), on-device Tesseract.js
  // (free, no key) in the browser, applied via the applyOcrText action.
  async function extractNow(docId: string) {
    setOcrBusy(true);
    setOcrError(null);
    try {
      if (!pickedFileRef.current) throw new Error("Pick the image again to extract from it.");
      const imgFile = pickedFileRef.current;

      // (1) Server-side vision OCR.
      const fd = new FormData();
      fd.append("docId", docId);
      fd.append("file", imgFile);
      const res = await fetch("/capture/extract", { method: "POST", body: fd });
      if (res.ok) {
        const j = await res.json();
        const filed = j.folder ? `, filed to ${j.folder}` : "";
        setDone(`Extracted ${j.chars.toLocaleString()} characters — classified ${j.kind}${filed}. It's searchable now.`);
        router.refresh();
        return;
      }
      const jErr = await res.json().catch(() => ({ error: "Extraction failed" }));
      if (res.status !== 503) throw new Error(jErr.error || "Extraction failed");

      // (2) On-device fallback — free, no key needed.
      const local = await readImageOnDevice(imgFile);
      if (!local) {
        throw new Error(`No readable text found on this device either. ` + OCR_SETUP_HINT);
      }
      const applied = await applyOcrText(docId, local);
      if (!applied.ok) throw new Error(applied.error ?? "Saving the extracted text failed");
      const filed = applied.folder ? `, filed to ${applied.folder}` : "";
      setDone(
        `Extracted ${applied.chars.toLocaleString()} characters on this device (free OCR, no API key) — classified ${applied.kind}${filed}. It's searchable now.`,
      );
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setOcrError(/not configured|on-device|on this device/i.test(msg) ? msg : `${msg} — ${OCR_SETUP_HINT}`);
    } finally {
      setOcrBusy(false);
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
            <input id="file" name="file" type="file" ref={fileRef}
              onChange={(e) => setIsImage(Boolean(e.target.files?.[0]?.type.startsWith("image/")))}
              className="input file:mr-3 file:rounded-lg file:border-0 file:bg-cue-blue/20 file:px-3 file:py-1.5 file:text-sm file:text-white" />
            {isImage && (
              <div className="mt-2 rounded-lg border border-cue-blue/30 bg-cue-blue/10 px-3 py-2 text-xs">
                <div className="font-semibold text-cue-blue">Image detected — what should CUE do with it?</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="radio" name="imgextract" checked={extractChoice === "extract"} onChange={() => setExtractChoice("extract")} />
                    <span>Read the text &amp; file it (OCR)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="radio" name="imgextract" checked={extractChoice === "save"} onChange={() => setExtractChoice("save")} />
                    <span>Just save the image</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="note">{t("capture.note")}</label>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleRecording} disabled={transcribing}
                className={`badge ${recording ? "badge-red" : "badge-blue"} cursor-pointer select-none`}>
                {recording ? "● " : "🎙 "}{transcribing ? t("capture.voiceTranscribing") : recording ? t("capture.voiceStop") : t("capture.voiceRecord")}
              </button>
              <button type="button"
                onClick={() => {
                  const el = noteRef.current;
                  if (!el) return;
                  if (!el.value.trim()) {
                    el.value = "ChatGPT conversation\n\nMe: \n\nChatGPT: \n\nMe: \n\nChatGPT: ";
                    el.focus();
                  }
                }}
                className="badge badge-purple cursor-pointer select-none">
                🤖 AI chat template
              </button>
              <span className="text-xs text-navy-300/70">Paste a ChatGPT/Claude/Gemini convo → it's detected, formatted, filed to “AI Chats”.</span>
            </div>
            <textarea id="note" name="note" rows={3} ref={noteRef} className="input" placeholder={t("capture.notePlaceholder")} />
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
          <div className="flex flex-wrap items-center gap-3">
            <span>{done}</span>
            {pendingDocId && (
              <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={ocrBusy}
                onClick={() => extractNow(pendingDocId)}>
                {ocrBusy ? "Reading…" : "✨ Extract & file it"}
              </button>
            )}
            {fail && (
              <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => { setDone(null); setFail(false); }}>
                Dismiss
              </button>
            )}
          </div>
          {ocrError && <p className="mt-2 text-xs text-red-300">{ocrError}</p>}
        </div>
      )}

      {dup && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Looks like a duplicate — <strong className="font-semibold">“{dup.title}”</strong> was
              already captured on {new Date(dup.uploadedAt).toLocaleDateString()} ({dup.how}).
            </span>
            <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setDup(null)}>Cancel</button>
            <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={busy} onClick={saveAnyway}>
              {busy ? "Saving…" : "Save anyway"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
