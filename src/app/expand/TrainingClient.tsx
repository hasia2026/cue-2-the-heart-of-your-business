"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLesson, attachQuiz, submitQuiz, markLessonComplete } from "./training-actions";

type Lesson = {
  id: string; title: string; sort: number; videoUrl: string | null; videoKind: string | null;
  durationMin: number | null; content: string | null;
  quiz: { passingPct: number; questions: { q: string; options: string[] }[] } | null;
  progress: { status: string; quizScore: number | null } | null;
};

type Module = {
  id: string; title: string; category: string; summary: string; content: string;
  lessons: Lesson[]; assignees: string[];
};

function VideoPlayer({ url, kind }: { url: string; kind: string | null }) {
  if (kind === "YOUTUBE") {
    const id = url.match(/(?:youtu\.be\/|v=)([\w-]{11})/)?.[1];
    if (id) return <iframe className="w-full aspect-video rounded-xl" src={`https://www.youtube.com/embed/${id}`} title="Lesson video" allowFullScreen />;
  }
  if (kind === "LOOM") {
    return <iframe className="w-full aspect-video rounded-xl" src={url.replace("/share/", "/embed/")} title="Lesson video" allowFullScreen />;
  }
  if (kind === "VIMEO") {
    const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
    if (id) return <iframe className="w-full aspect-video rounded-xl" src={`https://player.vimeo.com/video/${id}`} title="Lesson video" allowFullScreen />;
  }
  if (kind === "UPLOAD") {
    // Local uploads are relative (/uploads/…); Supabase Storage URLs are absolute.
    return <video controls className="w-full rounded-xl" src={url} />;
  }
  if (/^https?:\/\//i.test(url)) {
    return <video controls className="w-full rounded-xl" src={url} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
      ▶ Watch lesson video
    </a>
  );
}

type QuizQuestion =
  | { type?: "SINGLE"; q: string; options: string[] }
  | { type: "MULTI"; q: string; options: string[] }
  | { type: "FREE"; q: string; sampleAnswer?: string };

function QuizTaker({ lessonId, questions, passingPct }: {
  lessonId: string;
  questions: QuizQuestion[];
  passingPct: number;
}) {
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [multi, setMulti] = useState<Record<number, Set<number>>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const allAnswered = questions.every((q, i) =>
    q.type === "FREE" ? (texts[i] ?? "").trim().length > 0
    : q.type === "MULTI" ? (multi[i]?.size ?? 0) > 0
    : choices[i] !== undefined
  );

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const payload = questions.map((q, i) =>
        q.type === "FREE" ? texts[i] ?? ""
        : q.type === "MULTI" ? [...(multi[i] ?? [])]
        : choices[i] ?? -1
      );
      const res = await submitQuiz(lessonId, payload);
      setResult({ score: res.score, passed: res.passed });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${result.passed ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200"}`}>
        {result.passed ? "✓ Passed" : "Not quite"} — {result.score}% (pass: {passingPct}%)
        {!result.passed && " — review and try again."}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-xl border border-navy-50 bg-white/[0.03] p-3.5">
          <div className="text-sm font-medium text-navy-900">
            {qi + 1}. {q.q}
            {q.type === "MULTI" && <span className="badge-low ml-2">select all that apply</span>}
            {q.type === "FREE" && <span className="badge-low ml-2">short answer</span>}
          </div>
          {q.type === "FREE" ? (
            <textarea
              rows={2}
              className="input mt-2"
              value={texts[qi] ?? ""}
              onChange={(e) => setTexts((t) => ({ ...t, [qi]: e.target.value }))}
              placeholder="Type your answer in your own words…"
            />
          ) : (
            <div className="mt-2 space-y-1">
              {q.options.map((opt, oi) =>
                q.type === "MULTI" ? (
                  <label key={oi} className="flex items-center gap-2 text-sm text-navy-600 cursor-pointer rounded-lg px-2 py-1 hover:bg-white/[0.05]">
                    <input
                      type="checkbox"
                      checked={multi[qi]?.has(oi) ?? false}
                      onChange={(ev) => {
                        const next = new Set(multi[qi] ?? []);
                        ev.target.checked ? next.add(oi) : next.delete(oi);
                        setMulti((m) => ({ ...m, [qi]: next }));
                      }}
                    />
                    {opt}
                  </label>
                ) : (
                  <label key={oi} className="flex items-center gap-2 text-sm text-navy-600 cursor-pointer rounded-lg px-2 py-1 hover:bg-white/[0.05]">
                    <input
                      type="radio"
                      name={`q-${lessonId}-${qi}`}
                      checked={choices[qi] === oi}
                      onChange={() => setChoices((a) => ({ ...a, [qi]: oi }))}
                    />
                    {opt}
                  </label>
                )
              )}
            </div>
          )}
        </div>
      ))}
      <button onClick={submit} disabled={busy || !allAnswered} className="btn-primary" title={allAnswered ? "" : "Answer every question"}>
        {busy ? "Scoring…" : "Submit quiz"}
      </button>
    </div>
  );
}

function LessonBuilder({ moduleId }: { moduleId: string }) {
  const [open, setOpen] = useState(false);
  const [quizFor, setQuizFor] = useState<string | null>(null);
  const [quizText, setQuizText] = useState(
    '[\n  {"q": "What is the first step?", "options": ["A", "B", "C", "D"], "answerIndex": 0}\n]'
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      // Direct-to-storage path: large videos bypass the server action
      // entirely via a signed Supabase upload URL.
      const fileInput = form.elements.namedItem("videoFile") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (file && file.size > 20 * 1024 * 1024) {
        setUploadPct(0);
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size, kind: "training" }),
        });
        const signed = await signRes.json();
        if (!signRes.ok) throw new Error(signed.error ?? "Could not start the upload");

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signed.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.setRequestHeader("x-upsert", signed.token);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
          };
          xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
          xhr.onerror = () => reject(new Error("Upload failed — network error"));
          xhr.send(file);
        });

        fd.delete("videoFile");
        fd.set("videoUrl", signed.publicUrl);
        fd.set("directUpload", "1");
        setUploadPct(100);
      }

      const res = await createLesson(fd);
      setMsg("Lesson added.");
      setUploadPct(null);
      setQuizFor(res.lessonId);
      form.reset();
      startTransition(() => router.refresh());
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
      setUploadPct(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuiz() {
    if (!quizFor || busy) return;
    setBusy(true);
    try {
      const res = await attachQuiz(quizFor, quizText);
      setMsg(`Quiz attached (${res.count} questions).`);
      setQuizFor(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Quiz invalid — check the JSON");
    } finally {
      setBusy(false);
    }
  }

  if (quizFor) {
    return (
      <div className="mt-3 rounded-xl border border-accent-purple/30 bg-accent-purple/5 p-4">
        <div className="text-sm font-medium text-navy-900 mb-2">Add a quiz (optional)</div>
        <textarea value={quizText} onChange={(e) => setQuizText(e.target.value)} rows={7} className="input font-mono text-xs" />
        <p className="text-[11px] text-navy-400 mt-1">JSON: q, options array, answerIndex (0-based). Trainees see questions; answers stay server-side.</p>
        <div className="flex gap-2 mt-2">
          <button onClick={saveQuiz} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Attach quiz"}</button>
          <button onClick={() => setQuizFor(null)} className="btn-ghost">Skip</button>
        </div>
        {msg && <p className="text-xs text-navy-500 mt-2">{msg}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm mt-3">+ Add lesson (video + text + optional quiz)</button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-navy-50 bg-white/[0.03] p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Lesson title</label>
          <input name="title" required className="input" placeholder="e.g. Before-you-leave checklist" />
        </div>
        <div>
          <label className="label">Duration (min, optional)</label>
          <input name="durationMin" type="number" min={1} max={600} className="input" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Upload video (up to 500MB, streams to cloud storage)</label>
          <input name="videoFile" type="file" accept="video/*" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:text-navy-700" />
          {uploadPct != null && (
            <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent-blue to-accent-purple transition-all" style={{ width: `${uploadPct}%` }} />
            </div>
          )}
        </div>
        <div>
          <label className="label">…or paste a video URL</label>
          <input name="videoUrl" className="input" placeholder="YouTube, Loom, Vimeo, or direct link" />
        </div>
      </div>
      <div>
        <label className="label">Lesson text / talking points</label>
        <textarea name="content" rows={4} className="input" placeholder="What should someone learn from this lesson?" />
      </div>
      <input type="hidden" name="moduleId" value={moduleId} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Create lesson"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
      </div>
      {msg && <p className="text-xs text-navy-500">{msg}</p>}
    </form>
  );
}

export default function TrainingClient({ modules }: { modules: Module[] }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const router = useRouter();

  function complete(lessonId: string) {
    markLessonComplete(lessonId).then(() => {
      setDoneIds((s) => new Set(s).add(lessonId));
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-4">
      {modules.map((m) => {
        const done = m.lessons.filter((l) => l.progress?.status === "COMPLETED" || doneIds.has(l.id)).length;
        return (
          <details key={m.id} className="rounded-xl border border-navy-100 p-4">
            <summary className="text-sm font-medium text-navy-900 cursor-pointer">
              {m.title}
              <span className="ml-2 badge-blue">{m.category}</span>
              {m.lessons.length > 0 && (
                <span className="ml-2 badge-low">{done}/{m.lessons.length} lessons</span>
              )}
            </summary>
            <p className="text-xs text-navy-500 mt-2">{m.summary}</p>

            <div className="mt-3 space-y-2">
              {m.lessons.map((l) => {
                const isDone = l.progress?.status === "COMPLETED" || doneIds.has(l.id);
                return (
                  <details key={l.id} className="rounded-xl border border-navy-50 bg-white/[0.02]">
                    <summary className="text-sm text-navy-800 cursor-pointer px-3.5 py-2.5 flex items-center gap-2 flex-wrap">
                      <span className={`h-5 w-5 rounded-full text-[10px] flex items-center justify-center shrink-0 ${isDone ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-navy-400"}`}>
                        {isDone ? "✓" : l.sort + 1}
                      </span>
                      <span className="font-medium">{l.title}</span>
                      {l.videoKind && <span className="badge-low">🎬 {l.videoKind.toLowerCase()}</span>}
                      {l.durationMin != null && <span className="badge-low">{l.durationMin} min</span>}
                      {l.quiz && <span className="badge-purple">quiz</span>}
                      {l.progress?.quizScore != null && <span className="badge-green">{l.progress.quizScore}%</span>}
                    </summary>
                    <div className="px-3.5 pb-3.5">
                      {l.videoUrl && <div className="my-3"><VideoPlayer url={l.videoUrl} kind={l.videoKind} /></div>}
                      {l.content && <pre className="text-xs text-navy-600 whitespace-pre-wrap font-sans">{l.content}</pre>}
                      {!isDone && (
                        <button onClick={() => complete(l.id)} className="btn-secondary text-xs mt-2">Mark lesson complete</button>
                      )}
                      {l.quiz && l.quiz.questions.length > 0 && (
                        <>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-400 mt-3 mb-1">Knowledge check</div>
                          <QuizTaker lessonId={l.id} questions={l.quiz.questions} passingPct={l.quiz.passingPct} />
                        </>
                      )}
                    </div>
                  </details>
                );
              })}
              {m.lessons.length === 0 && <p className="muted text-xs">No lessons yet — add the first one below.</p>}
            </div>

            <LessonBuilder moduleId={m.id} />
            {m.assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {m.assignees.map((n) => <span key={n} className="badge-low">👤 {n}</span>)}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
