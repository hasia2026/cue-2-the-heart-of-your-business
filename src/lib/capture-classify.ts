// Shared capture classification + auto-filing. One home for the rules so
// notes, pasted AI chats, and OCR'd images all land in the same folders.
import { createHash } from "node:crypto";
import { sql } from "@/lib/db";

export type CaptureClass = { kind: string; tags: string[] };

const RULES: { match: RegExp; kind: string; tags: string[] }[] = [
  { match: /\bchatgpt\b|\bclaude\b|\bgemini\b|\bcopilot\b|\bperplexity\b|\b(as an? ai\b|large language|prompt:|assistant:)|\bchat (gpt\s*4|with an? (ai|assistant|bot))\b/i,
    kind: "AI_CHAT", tags: ["ai-chat"] },
  { match: /handbook|policy|pto|benefit|warranty|refund/i, kind: "POLICY", tags: ["policy"] },
  { match: /sop|procedure|process|onboarding|checklist/i, kind: "PROCEDURE", tags: ["procedure", "operations"] },
  { match: /contract|agreement|msa|proposal|deal/i, kind: "CONTRACT", tags: ["contract", "legal"] },
  { match: /invoice|receipt|payment|statement/i, kind: "RECORD", tags: ["finance"] },
  { match: /estimate|quote|appraisal/i, kind: "RECORD", tags: ["sales"] },
  { match: /\.xlsx|\.csv|sheet|roster|inventory/i, kind: "SPREADSHEET", tags: ["data"] },
];

// Folder names per document kind — the "auto Google Drive" mapping. Kinds not
// listed file into "Captured" (a general inbox folder).
export const FOLDER_FOR_KIND: Record<string, string> = {
  AI_CHAT: "AI Chats",
  POLICY: "Policies & Procedures",
  PROCEDURE: "Policies & Procedures",
  CONTRACT: "Contracts",
  RECORD: "Invoices & Receipts",
  SPREADSHEET: "Spreadsheets & Data",
  MEDIA: "Images & Media",
};

export function classifyCapture(text: string): CaptureClass {
  const rule = RULES.find((r) => r.match.test(text));
  return { kind: rule?.kind ?? "OTHER", tags: rule?.tags ?? [] };
}

// ── Duplicate detector ────────────────────────────────────────────────
// The capture flow computes a content hash (sha256 of the uploaded file's
// bytes for uploads; whitespace-normalized note text for pasted notes) and
// checks it against the org's existing documents before inserting, so the
// same photo or transcribed note can't pile up as mystery copies.

export function hashContent(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex").toUpperCase();
}

/** Text capture hash: case/whitespace-insensitive so retype + paste of the
 *  same note still matches. */
export function normalizeTextHash(text: string): string {
  return hashContent(text.toLowerCase().replace(/\s+/g, " "));
}

export type DuplicateHit = {
  docId: string;
  title: string;
  uploadedAt: string;
  how: string; // human explanation of why it matched
};

// ── Fuzzy near-duplicate matching ───────────────────────────────────
// Identical-file captures burn their byte hash, but a re-exported PDF,
// a slightly cropped screenshot, or a re-pasted note with an edited line
// hashes differently — near-duplicates need a similarity check instead.
// Word-set Jaccard over trimmed tokens: cheap, language-agnostic, and
// stable for the styles of "same doc again" CUE actually sees (same file
// re-named "(1)", same note re-typed, same quote re-pasted).

function tokens(s: string, minLen = 3): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= minLen),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

export type FuzzyCandidate = {
  id: string;
  title: string;
  fileName: string | null;
  text: string | null;
};

/** Best fuzzy match for the incoming capture among the org's recent
 *  documents, or null. Two similarity channels:
 *  1. Title: incoming title (cleaned file name / note excerpt) vs each
 *     document's title — near-identical wording (≥ 2 shared meaningful
 *     tokens and ≥ 70% token overlap) catches "report (1).pdf" copies.
 *  2. Text: pasted note vs a document's extracted text — ≥ 85% word
 *     overlap catches a note re-typed with small edits.
 */
export function findFuzzyDuplicate(
  candidate: { title: string; text: string | null },
  docs: FuzzyCandidate[],
): { doc: FuzzyCandidate; how: string } | null {
  const candTitle = tokens(candidate.title);
  let best: { doc: FuzzyCandidate; how: string; score: number } | null = null;
  for (const doc of docs) {
    // 1. Title channel — require ≥2 shared tokens so a lone word like
    // "invoice" on both sides of two different suppliers' files can't flag.
    const docTitle = tokens(`${doc.title ?? ""} ${doc.fileName ?? ""}`);
    let shared = 0;
    for (const w of candTitle) if (docTitle.has(w)) shared++;
    const titleScore = jaccard(candTitle, docTitle);
    if (shared >= 2 && titleScore >= 0.7 && titleScore > (best?.score ?? 0)) {
      best = {
        doc,
        how: `very similar title to another capture (${Math.round(titleScore * 100)}% overlap)`,
        score: titleScore,
      };
    }
    // 2. Text channel — only for pasted notes, against extracted text.
    if (candidate.text) {
      const a = tokens(candidate.text.slice(0, 4000));
      const b = tokens((doc.text ?? "").slice(0, 4000));
      const textScore = jaccard(a, b);
      if (textScore >= 0.85 && textScore > (best?.score ?? 0)) {
        best = {
          doc,
          how: `nearly the same text as "${doc.title}" (${Math.round(textScore * 100)}% overlap)`,
          score: textScore,
        };
      }
    }
  }
  return best ? { doc: best.doc, how: best.how } : null;
}

export async function findDuplicateCapture(
  orgId: string,
  opts: {
    hash: string | null;
    fileName: string | null;
    sizeBytes: number | null;
    // Fuzzy inputs (optional): a human title for the new capture and, for
    // pasted notes, its raw text. When null the fuzzy pass is skipped.
    title?: string | null;
    text?: string | null;
  },
): Promise<DuplicateHit | null> {
  const { hash, fileName, sizeBytes } = opts;
  if (hash) {
    const [hit] = await sql`
      select id, title, uploaded_at from documents
      where organization_id = ${orgId} and content_hash = ${hash}
      order by uploaded_at desc limit 1`;
    if (hit) {
      return {
        docId: hit.id as string,
        title: hit.title as string,
        uploadedAt: String(hit.uploaded_at),
        how: "identical content already captured",
      };
    }
  }
  // Legacy fallback: rows captured before content_hash existed are still
  // caught when the exact same file name AND byte size were uploaded.
  if (fileName && sizeBytes != null) {
    const [hit] = await sql`
      select id, title, uploaded_at from documents
      where organization_id = ${orgId}
        and lower(file_name) = lower(${fileName})
        and size_bytes = ${sizeBytes}
        and content_hash is null
      order by uploaded_at desc limit 1`;
    if (hit) {
      return {
        docId: hit.id as string,
        title: hit.title as string,
        uploadedAt: String(hit.uploaded_at),
        how: "same file name and size already captured",
      };
    }
  }
  // Fuzzy near-duplicates: recent captures (90 days) with similar titles
  // or near-identical note text. Runs on the small recent set so the
  // comparison is a few KB of work, not a table scan of similarities.
  if (opts.title || opts.text) {
    try {
      const recent = await sql`
        select id, title, file_name, extracted_text, uploaded_at from documents
        where organization_id = ${orgId} and uploaded_at > now() - interval '90 days'
        order by uploaded_at desc limit 200`;
      const fuzzy = findFuzzyDuplicate(
        { title: opts.title ?? "", text: opts.text ?? null },
        recent.map(
          (d): FuzzyCandidate => ({
            id: String(d.id),
            title: String(d.title ?? ""),
            fileName: d.file_name ? String(d.file_name) : null,
            text: d.extracted_text ? String(d.extracted_text) : null,
          }),
        ),
      );
      if (fuzzy) {
        const at = recent.find((d) => String(d.id) === fuzzy.doc.id)?.uploaded_at;
        return {
          docId: fuzzy.doc.id,
          title: fuzzy.doc.title,
          uploadedAt: at ? String(at) : "",
          how: fuzzy.how,
        };
      }
    } catch {
      // Fuzzy is best-effort hardening — a query hiccup must never block a
      // legitimate capture; the exact-match checks above already ran.
    }
  }
  return null;
}

/** Find-or-create the org's auto folder for a kind, by folder name.
 *  Concurrent first-captures could insert twice; on a unique-key error we
 *  re-select so two simultaneous uploads can't create duplicate folders. */
export async function fileToFolder(
  orgId: string,
  kind: string,
): Promise<{ id: string; name: string } | null> {
  const name = FOLDER_FOR_KIND[kind] ?? "Captured";
  const [existing] = await sql`
    select id, name from departments where organization_id = ${orgId} and name = ${name} limit 1`;
  if (existing) return existing as { id: string; name: string };
  try {
    const [created] = await sql`
      insert into departments (organization_id, name) values (${orgId}, ${name}) returning id, name`;
    return (created as { id: string; name: string }) ?? null;
  } catch {
    const [raced] = await sql`
      select id, name from departments where organization_id = ${orgId} and name = ${name} limit 1`;
    return (raced as { id: string; name: string }) ?? null;
  }
}
