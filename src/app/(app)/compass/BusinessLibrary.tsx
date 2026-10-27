"use client";

import { useState } from "react";
import { saveLibrarySection } from "./actions";
import type { LibraryQuestion } from "./questions";

type Answered = { question: string; answer: string; updatedAt: string };

const MAX_ANSWER = 4000;

/**
 * The Executive Library: sections collapse into one card each; the owner
 * types plain sentences and Save writes every textarea as its own row, so a
 * half-finished session never loses work. Non-editors see the answers read-only.
 */
export default function BusinessLibrary({
  sections,
  answered,
  canEdit,
}: {
  sections: Record<string, LibraryQuestion[]>;
  answered: Answered[];
  canEdit: boolean;
}) {
  const answerFor = new Map(answered.map((a) => [a.question, a]));
  const [open, setOpen] = useState<string | null>(null);
  const entryCount = new Map(sectionsKeys(sections).map((s) => [s, answered.filter((a) => sections[s].some((q) => q.id === a.question)).length]));

  return (
    <section className="card p-5">
      <h2 className="section-title">Executive library</h2>
      <p className="muted mb-4 text-xs">
        The interview CUE runs its tone on. Answer in plain sentences — this is your company&apos;s brain,
        readable by every screen and the AI ambassador. Answers save per section; nothing is graded.
      </p>
      <div className="space-y-2">
        {Object.entries(sections).map(([section, qs]) => {
          const count = entryCount.get(section) ?? 0;
          const isOpen = open === section;
          return (
            <div key={section} className="rounded-xl border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : section)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start"
                aria-expanded={isOpen}
              >
                <span className="font-medium text-navy-100">{section}</span>
                <span className={`badge ms-auto ${count === qs.length ? "badge-green" : count > 0 ? "badge-orange" : "badge-low"}`}>
                  {count}/{qs.length} answered
                </span>
                <span aria-hidden className="text-navy-300">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                canEdit ? (
                  <form action={saveLibrarySection} className="space-y-3 border-t border-white/[0.06] p-4">
                    {qs.map((q) => (
                      <label key={q.id} className="block">
                        <span className="text-xs font-medium text-navy-100">{q.prompt}</span>
                        {q.hint && <span className="muted ms-2 text-[11px]">{q.hint}</span>}
                        <textarea
                          name={q.id}
                          rows={2}
                          maxLength={MAX_ANSWER}
                          defaultValue={answerFor.get(q.id)?.answer ?? ""}
                          className="input mt-1 text-sm"
                          placeholder="Write it like you'd tell a new hire…"
                        />
                      </label>
                    ))}
                    <div className="flex items-center gap-2">
                      <button type="submit" className="btn-primary !py-1.5 text-xs">Save {section.toLowerCase()}</button>
                      <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(null)}>Done</button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2 border-t border-white/[0.06] p-4">
                    {qs.map((q) => (
                      <div key={q.id} className="grid gap-0.5">
                        <span className="text-xs font-medium text-navy-100">{q.prompt}</span>
                        <span className="text-sm text-navy-300">{answerFor.get(q.id)?.answer || "—"}</span>
                      </div>
                    ))}
                    <p className="muted text-[11px]">Only owners, admins and managers can edit the library.</p>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {answered.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-violet-300">View everything as one document ({answered.length} answers)</summary>
          <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-white/[0.07] p-4">
            {Object.entries(sections).map(([section, qs]) => (
              <div key={section} className="mb-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-navy-300/70">{section}</h3>
                {qs.map((q) => (
                  <p key={q.id} className="mt-1.5 text-sm text-navy-300">
                    <span className="text-navy-100/80">{q.prompt} </span>
                    {answerFor.get(q.id)?.answer || "(not answered)"}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function sectionsKeys<T>(sections: Record<string, T>): string[] {
  return Object.keys(sections);
}
