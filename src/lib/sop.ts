// Voice-SOP drafting — deterministic, no LLM in the critical path so the
// prototype works on every deployment (LLM-keyed or not). A recorded
// walkthrough transcript becomes a numbered procedure: sentences become
// steps, command-ish utterances are kept verbatim, filler is dropped.
// The Knowledge editor is the human editing layer — CUE drafts, the owner
// corrects (same human-in-control rule as insights).

const FILLERS = /\b(um+|uh+|er+|ah+|like i said|you know|i mean|sort of|kind of)\b[,.\s]*/gi;

/** Split a transcript into procedure steps. Sentence-based splitting that
 *  tolerates Spanish (¿/¡ inverted punctuation) and missing final periods. */
export function transcribedToSteps(transcript: string): string[] {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // Normalize punctuation into sentence terminators for stream-y speech.
  const sentences = cleaned
    .replace(/([\u061F\u2047\u0964\u3002\u2026])/g, ".") // CJK/devanagari & ellipsis terminators → "."
    .split(/(?<=[.!?])\s+(?=[A-Z¿¡\p{Lu}])/u)
    .map((s) => s.replace(FILLERS, "").trim().replace(/^[,;:\-–—]\s*/, ""))
    .filter((s) => s.length > 3 && /\p{L}/u.test(s));
  // Merge micro-sentences (e.g. "OK." + "First open the invoice screen.")
  // into at most one leading acknowledgment.
  const steps: string[] = [];
  for (const s of sentences) {
    if (s.length < 12 && steps.length > 0 && /^(ok|okay|right|good|done|listo|bien|vale|được)\b/i.test(s)) continue;
    steps.push(s.length > 0 && s[0] !== s[0].toUpperCase() && /\p{Ll}|\p{Lo}/u.test(s[0]) ? s : s);
  }
  return steps.length ? steps : [cleaned];
}

/** The knowledge_items.content payload — steps first, transcript appended as
 *  provenance so nothing from the spoken source is silently lost. */
export function assembleSopContent(title: string, steps: string[], transcript: string): string {
  const numbered = steps.map((s, i) => `Step ${i + 1}: ${s.replace(/[.]$/, "")}.`).join("\n");
  return `${title}\n\n${steps.length} step(s) drafted from a recorded walkthrough:\n\n${numbered}\n\n— Transcript (unedited):\n${transcript.slice(0, 4000)}`;
}
