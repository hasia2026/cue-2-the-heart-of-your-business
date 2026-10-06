"use client";

import { useState } from "react";
import { importTraining, recordAttempt } from "./actions";

type QuizQ = { q: string; choices: string[]; answer: number };
export type LibModule = {
  id: string; title: string; summary: string; category: string;
  contentUrl: string | null; content: string; quiz: QuizQ[];
  attempts: number; avgScore: number;
  myScore: number | null; myTotal: number | null;
};
export type TeamRow = { name: string; email: string; attempts: number; avgScore: number; lastAt: string };

export default function TrainingLibrary({ modules, team, canImport, labels }: {
  modules: LibModule[]; team: TeamRow[]; canImport: boolean; labels: Record<string, string>;
}) {
  const t = (k: string) => labels[k] ?? k;
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [results, setResults] = useState<Record<string, { score: number; total: number }>>({});
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  function choose(moduleId: string, qi: number, ci: number) {
    setAnswers((prev) => {
      const arr = [...(prev[moduleId] ?? Array.from({ length: modules.find((m) => m.id === moduleId)?.quiz.length ?? 0 }, () => -1))];
      arr[qi] = ci;
      return { ...prev, [moduleId]: arr };
    });
  }

  async function submit(m: LibModule) {
    if (busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("moduleId", m.id);
      fd.set("answers", JSON.stringify(answers[m.id] ?? []));
      const res = await recordAttempt(fd);
      setResults((prev) => ({ ...prev, [m.id]: res }));
    } finally {
      setBusy(false);
    }
  }

  const passed = (m: LibModule) => {
    const res = results[m.id];
    const s = res ?? (m.myTotal ? { score: m.myScore ?? 0, total: m.myTotal } : null);
    return s && s.total > 0 && s.score / s.total >= 0.8;
  };

  const input = (name: string, label: string, required = false) => (
    <div>
      <label className="label">{label}</label>
      <input name={name} required={required} className="input" />
    </div>
  );

  const quizSlot = (i: number) => (
    <div className="rounded-xl border border-white/[0.06] p-4">
      <div className="font-medium text-navy-100">{t("training.quizQ").replace("{n}", String(i))}</div>
      <input name={`q${i}`} className="input mt-2" placeholder={t("training.quizPh")} />
      <textarea name={`ch${i}`} rows={3} className="input mt-2" placeholder={t("training.choicesPh")} />
      <input name={`a${i}`} type="number" min={1} max={4} defaultValue={1} className="input mt-2 w-24" />
    </div>
  );

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title">{t("training.library")}</h2>
        {canImport && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary ms-auto !py-1.5 !text-xs">{t("training.addModule")}</button>
        )}
      </div>
      <p className="muted mt-1 text-xs">{t("training.librarySub")}</p>

      {canImport && showForm && (
        <form action={importTraining} className="mt-4 space-y-3 rounded-2xl border border-white/[0.06] p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {input("title", t("training.modTitle"), true)}
            <div>
              <label className="label">{t("training.modCategory")}</label>
              <select name="category" className="input">
                <option value="PROCESS">PROCESS</option>
                <option value="CUSTOMER">CUSTOMER</option>
                <option value="PRODUCT">PRODUCT</option>
                <option value="SAFETY">SAFETY</option>
                <option value="ONBOARDING">ONBOARDING</option>
              </select>
            </div>
            {input("videoUrl", t("training.videoUrl"))}
          </div>
          <div>
            <label className="label">{t("training.lessonText")}</label>
            <textarea name="content" rows={3} className="input" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">{quizSlot(1)}{quizSlot(2)}{quizSlot(3)}</div>
          <button className="btn-primary">{t("training.import")}</button>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {modules.map((m) => {
          const quiz = m.quiz ?? [];
          const res = results[m.id] ?? (m.myTotal ? { score: m.myScore ?? 0, total: m.myTotal } : null);
          return (
            <div key={m.id} className="rounded-2xl border border-white/[0.06] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{m.title}</span>
                <span className="badge-blue">{m.category}</span>
                {passed(m) && <span className="badge-green">{t("training.passed")}</span>}
                <span className="muted ms-auto text-xs">{t("training.avgScore")}: {m.avgScore}% · {m.attempts} {t("training.attempts")}</span>
              </div>
              <p className="muted mt-1 text-sm">{m.summary}</p>
              {m.contentUrl && (
                <a href={m.contentUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-3 !py-1 !text-xs">▶ {t("training.watch")}</a>
              )}
              {m.content && <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-navy-300">{m.content}</p>}

              {quiz.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
                  {quiz.map((q, qi) => (
                    <div key={qi}>
                      <div className="text-sm font-medium text-navy-100">{qi + 1}. {q.q}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {q.choices.map((c, ci) => (
                          <button
                            key={ci}
                            onClick={() => choose(m.id, qi, ci + 1)}
                            className={`rounded-lg border px-3 py-1.5 text-xs transition ${(answers[m.id] ?? [])[qi] === ci + 1 ? "border-violet-400/50 bg-violet-500/20 text-violet-200" : "border-white/[0.08] text-navy-100/70 hover:bg-white/[0.05]"}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => submit(m)} disabled={busy} className="btn-primary !py-1.5 !text-xs">{t("training.submit")}</button>
                    {res && res.total > 0 && (
                      <span className={`text-sm font-semibold ${res.score / res.total >= 0.8 ? "text-emerald-300" : "text-amber-300"}`}>
                        {t("training.yourScore")}: {res.score}/{res.total}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {modules.length === 0 && <p className="muted">{t("training.noModules")}</p>}
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-4">
        <h3 className="font-semibold text-white">{t("training.teamProgress")}</h3>
        {team.length > 0 ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-widest text-navy-300/70">
                <th className="pb-2">{t("training.thEmployee")}</th>
                <th className="pb-2">{t("training.thAttempts")}</th>
                <th className="pb-2">{t("training.thAvg")}</th>
                <th className="pb-2">{t("training.thLast")}</th>
              </tr>
            </thead>
            <tbody>
              {team.map((r, i) => (
                <tr key={i} className="border-t border-white/[0.05]">
                  <td className="py-2 text-navy-100">{r.name}</td>
                  <td className="py-2 text-navy-300">{r.attempts}</td>
                  <td className={`py-2 font-medium ${r.avgScore >= 80 ? "text-emerald-300" : r.avgScore >= 50 ? "text-amber-300" : "text-red-300"}`}>{r.avgScore}%</td>
                  <td className="py-2 text-xs text-navy-300/70">{r.lastAt ? new Date(r.lastAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted mt-2 text-sm">{t("training.noAttempts")}</p>
        )}
      </div>
    </section>
  );
}
