"use client";

import { useRef, useState } from "react";

type SopResult = { id?: string; title?: string; steps?: string[]; error?: string; content?: string };

/** Record a spoken walkthrough → CUE drafts a numbered procedure in Knowledge.
 *  Recorder degrades honestly when the browser or mic is unavailable — the
 *  audio path stays the same one Capture uses. */
export default function SopRecorder() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<SopResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setMsg(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setMsg("Microphone unavailable — check browser permission, or upload audio through Capture instead.");
    }
  }

  function stop() {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
    setRecording(false);
    rec.onstop = () => void submit(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
  }

  async function submit(blob: Blob) {
    if (!blob.size) {
      setMsg("Nothing recorded.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", blob, "sop.webm");
      if (title.trim()) form.append("title", title.trim());
      const res = await fetch("/api/knowledge/sop", { method: "POST", body: form });
      const body: SopResult = await res.json();
      if (!res.ok) {
        setMsg(body.error ?? `Error ${res.status}`);
        return;
      }
      setResult(body);
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="section-title mb-1">Record a procedure</h2>
      <p className="muted mb-3 text-xs">
        Talk through a process the way you&apos;d teach a new hire — CUE transcribes it and drafts numbered steps as a
        PROCEDURE in Knowledge. Draft only; edit the text afterwards. Nothing is published automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input flex-1 min-w-[220px]"
          placeholder="Procedure title (e.g. How we open a trade-in)"
          maxLength={120}
        />
        {recording ? (
          <button onClick={stop} disabled={busy} className="btn-primary text-xs">
            ⏹ Stop &amp; generate
          </button>
        ) : (
          <button onClick={start} disabled={busy} className="btn-primary text-xs">
            🎙 {busy ? "Transcribing…" : "Record"}
          </button>
        )}
      </div>
      {msg && <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">{msg}</div>}
      {result?.steps && (
        <div className="mt-4 rounded-xl border border-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white">{result.title}</span>
            <a href="/knowledge" className="text-xs text-cyan-300 hover:underline">Saved to Knowledge ✓</a>
          </div>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-navy-200">
            {result.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
