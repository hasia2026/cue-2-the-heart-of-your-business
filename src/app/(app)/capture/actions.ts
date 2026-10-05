"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const RULES: { match: RegExp; kind: string; tags: string[] }[] = [
  { match: /handbook|policy|pto|benefit|warranty|refund/i, kind: "POLICY", tags: ["policy"] },
  { match: /sop|procedure|process|onboarding|checklist/i, kind: "PROCEDURE", tags: ["procedure", "operations"] },
  { match: /contract|agreement|msa|proposal|deal/i, kind: "CONTRACT", tags: ["contract", "legal"] },
  { match: /invoice|receipt|payment|statement/i, kind: "RECORD", tags: ["finance"] },
  { match: /estimate|quote|appraisal/i, kind: "RECORD", tags: ["sales"] },
  { match: /\.xlsx|\.csv|sheet|roster|inventory/i, kind: "SPREADSHEET", tags: ["data"] },
];

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "our", "are", "was", "were", "will", "have", "has", "not", "any", "all"]);

function keywords(text: string, max = 5): string[] {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

export async function captureDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const file = formData.get("file") as File | null;
  const note = String(formData.get("note") ?? "").trim();
  if (!file || file.size === 0) {
    if (!note) throw new Error("Provide a file or a note");
  }

  const extracted = note
    ? note
    : `Captured file: ${file!.name} (${file!.type || "unknown type"}, ${Math.round(file!.size / 1024)} KB). Full content extraction (OCR/parser) activates when a document processor is connected — the item is registered, classified, and searchable now.`;

  const classifyText = `${file?.name ?? ""} ${extracted}`;
  const rule = RULES.find((r) => r.match.test(classifyText));
  const kind = rule?.kind ?? "OTHER";
  const tags = rule?.tags ?? [];

  const [doc] = await sql`
    insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source)
    values (${orgId}, ${file ? file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") : note.slice(0, 60) || "Captured note"},
      ${file?.name ?? `note-${Date.now()}.txt`}, ${file?.type || "text/plain"}, ${file ? file.size : note.length},
      ${kind}, 'PROCESSED', ${extracted}, ${file ? "UPLOAD" : "IMPORT"})
    returning id`;

  // Extract: top terms → entities + assumptions linked to this document
  const terms = keywords(classifyText);
  for (const term of terms.slice(0, 3)) {
    const [entity] = await sql`
      insert into entities (organization_id, type, name, description)
      values (${orgId}, 'PROCESS', ${term}, ${`Identified from capture: ${doc.id}`})
      returning id`;
    await sql`
      insert into facts (organization_id, entity_id, statement, document_id, confidence, status)
      values (${orgId}, ${entity.id}, ${`"${term}" appears in a captured item (${new Date().toLocaleDateString()}).`}, ${doc.id}, 0.7, 'ASSUMPTION')`;
  }

  await sql`
    insert into knowledge_items (organization_id, document_id, title, content, category, tags, status)
    values (${orgId}, ${doc.id}, ${file ? file.name.replace(/\.[^.]+$/, "") : note.slice(0, 60) || "Captured note"},
      ${extracted}, ${kind === "POLICY" ? "POLICY" : kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY"},
      ${tags.join(",")}, 'ASSUMPTION')`;

  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "DOCUMENT_CAPTURED",
    targetType: "Document",
    targetId: doc.id,
    detail: `Classified as ${kind}${tags.length ? `, tagged ${tags.join(", ")}` : ""}`,
    metadata: { kind, tags, keywords: terms },
  });

  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ok: true, docId: doc.id, kind, tags };
}
