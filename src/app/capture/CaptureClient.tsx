"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureDocument } from "./actions";

const KINDS = ["Document", "PDF", "Image", "Spreadsheet", "Note", "Email / conversation"];

export default function CaptureClient() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [step, setStep] = useState(0); // pipeline animation step

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDone(null);
    setStep(1);
    const fd = new FormData(e.currentTarget);

    // Show the pipeline doing its work (classify → extract → organize)
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 4)), 350);
    try {
      const res = await captureDocument(fd);
      setStep(5);
      setDone(`Captured & classified as ${res.kind}${res.tags.length ? ` · connected to ${res.tags.join(", ")}` : ""}. It is now searchable in Knowledge and available to CUE AI.`);
      formRef.current?.reset();
      router.refresh();
    } catch (err) {
      setDone(err instanceof Error ? err.message : "Capture failed");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const steps = ["Capture", "Classify", "Extract", "Organize", "Searchable"];

  return (
    <section className="card p-6">
      <h2 className="section-title mb-1">Bring information in</h2>
      <p className="muted mb-4">Files or notes. CUE identifies what the information is, connects it, and makes it searchable.</p>

      <form ref={formRef} onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="file">Upload document</label>
            <input
              id="file" name="file" type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.mp3,.mp4"
              className="input file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:text-navy-700"
            />
          </div>
          <div>
            <label className="label" htmlFor="note">…or capture a note / conversation</label>
            <textarea id="note" name="note" rows={3} className="input" placeholder="e.g. Met with the Hendersons — they want a generator quote before storm season." />
          </div>
        </div>
        <div className="flex md:flex-col items-stretch md:w-44 gap-2">
          <button type="submit" disabled={busy} className="btn-primary md:w-full">
            {busy ? "Processing…" : "Capture"}
          </button>
          <div className="text-xs text-navy-400 md:mt-1">
            Supports documents, PDFs, images, video, audio, spreadsheets, forms, emails and conversations.
          </div>
        </div>
      </form>

      {/* Pipeline indicator */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`badge ${i < step ? "badge-green" : i === step && busy ? "badge-blue" : "badge-low"}`}
            >
              {i < step ? "✓" : i + 1} {s}
            </span>
            {i < steps.length - 1 && <span className="text-navy-200 text-xs">→</span>}
          </div>
        ))}
      </div>

      {done && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${done.includes("failed") ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"}`}>
          {done}
        </div>
      )}
    </section>
  );
}
