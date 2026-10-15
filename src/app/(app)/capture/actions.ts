"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { classifyCapture, fileToFolder, findDuplicateCapture, hashContent, normalizeTextHash } from "@/lib/capture-classify";
import { applyExtractedText } from "@/lib/ocr-apply";

// On-device OCR fallback: the browser runs Tesseract.js (free, no API key)
// when no Groq key is configured, then sends the raw text here. Same
// post-processing as the server route — reclassify, refile, knowledge.
export async function applyOcrText(docId: string, text: string) {
  const session = await requireSessionAction();
  const clean = text.trim();
  if (!clean) return { ok: false as const, error: "No extracted text to save." };
  const [doc] = await sql`
    select id, title from documents where id = ${docId} and organization_id = ${session.organizationId}`;
  if (!doc) return { ok: false as const, error: "Document not found in your organization." };
  const applied = await applyExtractedText({
    orgId: session.organizationId,
    actorId: session.user.id,
    docId: doc.id as string,
    title: doc.title as string,
    text: clean,
    model: "tesseract.js (on-device)",
  });
  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ...applied };
}

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "our", "are", "was", "were", "will", "have", "has", "not", "any", "all"]);

function keywords(text: string, max = 5): string[] {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().split(/\W+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}

// Content of a pasted AI conversation becomes a readable transcript doc.
// Normalizes literal "\\n" sequences the paste may carry into real newlines.
function formatAiChat(raw: string): string {
  const normalized = raw.replace(/\\n/g, "\n").trim();
  const stamped = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `AI conversation captured ${stamped}\n\n---\n\n${normalized}`;
}

export async function captureDocument(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const file = formData.get("file") as File | null;
  const note = String(formData.get("note") ?? "").trim();
  // A "real" file has bytes and a name. Empty file inputs, phantom zero-byte
  // File entries (e.g. a cleared picker leaves a nameless 0-byte File), and
  // pasted Blob objects with no filename are all treated as if no file was
  // uploaded — they fall back to the note path like every other capture.
  const hasFile = Boolean(file && file.size > 0 && String(file.name ?? "").trim());
  const isImage = hasFile && Boolean(file!.type.startsWith("image/"));
  const extract = String(formData.get("extract") ?? "") === "1";
  const ignoreDuplicate = String(formData.get("ignoreDuplicate") ?? "") === "1";
  if (!hasFile) {
    if (!note) throw new Error("Provide a file or a note");
  }

  // Duplicate detector: sha256 of the file bytes (or normalized note text)
  // checked against this org's existing documents. Blocked unless the user
  // explicitly confirms "Save anyway".
  const contentHash = hasFile
    ? hashContent(Buffer.from(await file!.arrayBuffer()))
    : note ? normalizeTextHash(note) : null;
  if (!ignoreDuplicate) {
    const duplicate = await findDuplicateCapture(orgId, {
      hash: contentHash,
      fileName: hasFile ? file!.name : null,
      sizeBytes: hasFile ? file!.size : null,
      // Fuzzy near-duplicate inputs — the same titles the insert below
      // derives: cleaned file name for uploads, note excerpt for pastes.
      title: hasFile
        ? file!.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
        : note.slice(0, 60) || "Captured note",
      text: hasFile ? null : note || null,
    });
    if (duplicate) {
      await logAudit({
        organizationId: orgId,
        actorId: session.user.id,
        action: "DOCUMENT_DUPLICATE_BLOCKED",
        targetType: "Document",
        targetId: duplicate.docId,
        detail: `Capture blocked — ${duplicate.how}: "${duplicate.title}"`,
        metadata: { duplicate, hash: contentHash },
      });
      revalidatePath("/capture");
      return {
        ok: false, docId: null, kind: "", tags: [] as string[], folder: null, needsOcr: false,
        duplicate,
      };
    }
  }

  // Image without "extract": save as-is, register only, no OCR. The client
  // will offer "Extract & file" afterwards, which hits /capture/extract.
  const isNonExtractImage = isImage && !extract;
  const kind0 = isNonExtractImage ? "MEDIA" : "OTHER";

  const classifyText = `${hasFile ? file!.name : ""} ${note}`;
  const looksAiChat = classifyCapture(note).kind === "AI_CHAT" && !hasFile;
  if (isImage && !extract) {
    // Image saved as-is — no OCR, MEDIA kind, "Extract & file" offered next.
  }
  const cls: { kind: string; tags: string[] } = isNonExtractImage
    ? { kind: "MEDIA", tags: ["image"] }
    : looksAiChat
      ? { kind: "AI_CHAT", tags: ["ai-chat"] }
      : classifyCapture(classifyText);
  const kind = isNonExtractImage ? kind0 : (cls.kind === "OTHER" && hasFile && !isImage ? "MEDIA" : cls.kind);

  const extracted = isNonExtractImage
    ? ""
    : note
      ? formatAiChat(note)
      : `Captured file: ${file!.name} (${file!.type || "unknown type"}, ${Math.round(file!.size / 1024)} KB). Full content extraction (OCR/parser) activates when a document processor is connected — the item is registered, classified, and searchable now.`;

  const title = hasFile ? file!.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
    : looksAiChat ? `AI chat — ${note.slice(0, 50)}` : note.slice(0, 60) || "Captured note";

  const [doc] = await sql`
    insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source, content_hash)
    values (${orgId}, ${title},
      ${hasFile ? file!.name : `note-${Date.now()}.txt`}, ${hasFile ? (file!.type || "text/plain") : "text/plain"}, ${hasFile ? file!.size : note.length},
      ${kind}, ${isNonExtractImage ? "UPLOADED" : "PROCESSED"}, ${extracted},
      ${hasFile ? "UPLOAD" : "IMPORT"}, ${contentHash})
    returning id`;

  // Auto-file into the folder for this kind (find-or-create a departments row).
  const folder = await fileToFolder(orgId, kind);
  if (folder) {
    await sql`update documents set department_id = ${folder.id} where id = ${doc.id}`;
  }

  // Extract: knowledge + assumptions linked to this document. Skipped for
  // non-extracted images (nothing to read yet) and OCR pending.
  if (!isNonExtractImage) {
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
      values (${orgId}, ${doc.id}, ${title},
        ${extracted}, ${kind === "POLICY" ? "POLICY" : kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY"},
        ${cls.tags.join(",")}, 'ASSUMPTION')`;
  }

  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "DOCUMENT_CAPTURED",
    targetType: "Document",
    targetId: doc.id,
    detail: `Classified as ${kind}${cls.tags.length ? `, tagged ${cls.tags.join(", ")}` : ""}${folder ? `, filed to ${folder.name}` : ""}`,
    metadata: { kind, tags: cls.tags, keywords: keywords(classifyText), folder: folder?.name ?? null },
  });

  revalidatePath("/capture");
  revalidatePath("/knowledge");
  return { ok: true, docId: doc.id, kind, tags: cls.tags, folder: folder?.name ?? null, needsOcr: isNonExtractImage, duplicate: null };
}
