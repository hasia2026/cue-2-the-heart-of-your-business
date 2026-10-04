"use server";

import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─────────────────────────────────────────────────────────────
// Capture pipeline: intake → classify → extract → organize →
// connect → make searchable. Runs locally (no external AI key
// required); the classification rules are intentionally simple
// and inspectable, and can be swapped for an LLM extractor later.
// ─────────────────────────────────────────────────────────────

const RULES: { match: RegExp; kind: string; tags: string[] }[] = [
  { match: /handbook|policy|pto|benefit/i, kind: "POLICY", tags: ["policy", "people"] },
  { match: /procedure|sop|process|onboarding/i, kind: "PROCEDURE", tags: ["procedure", "operations"] },
  { match: /contract|agreement|msa|proposal/i, kind: "CONTRACT", tags: ["contract", "legal"] },
  { match: /invoice|receipt|payment|statement/i, kind: "RECORD", tags: ["finance"] },
  { match: /estimate|quote/i, kind: "RECORD", tags: ["sales"] },
  { match: /warranty|refund/i, kind: "POLICY", tags: ["policy", "service"] },
  { match: /\.xlsx|\.csv|sheet/i, kind: "SPREADSHEET", tags: ["data"] },
];

const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "our", "are", "was", "were", "will", "have", "has", "not", "any", "all"]);

function keywords(text: string, max = 6): string[] {
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

  const extracted = note
    ? note
    : file
      ? `Captured file: ${file.name} (${file.type || "unknown type"}). Full content extraction (OCR / parser) runs when a document processor is connected — the file is registered, classified and searchable now.`
      : "";

  if (!file && !note) throw new Error("Provide a file or a note");

  // Classify
  const classifyText = `${file?.name ?? ""} ${extracted}`;
  const rule = RULES.find((r) => r.match.test(classifyText));
  const kind = rule?.kind ?? "OTHER";
  const tags = rule?.tags ?? [];

  // Persist document
  const doc = await prisma.document.create({
    data: {
      organizationId: orgId,
      title: file?.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") ?? (note.slice(0, 60) || "Captured note"),
      fileName: file?.name ?? `note-${Date.now()}.txt`,
      mimeType: file?.type || "text/plain",
      sizeBytes: file ? file.size : note.length,
      kind,
      status: "PROCESSED",
      extractedText: extracted || null,
      source: file ? "UPLOAD" : "IMPORT",
    },
  });

  // Extract: key terms → entities + facts, linked to this document
  const terms = keywords(`${file?.name ?? ""} ${extracted}`);
  for (const term of terms.slice(0, 3)) {
    const entity = await prisma.entity.create({
      data: {
        organizationId: orgId,
        type: "PROCESS",
        name: term,
        description: `Identified from capture: ${doc.title}`,
      },
    });
    await prisma.fact.create({
      data: {
        organizationId: orgId,
        entityId: entity.id,
        statement: `“${term}” appears in ${doc.title}, captured ${new Date().toLocaleDateString()}.`,
        documentId: doc.id,
        confidence: 0.7,
        status: "ASSUMPTION",
      },
    });
  }

  // Organize: knowledge item so it is searchable immediately
  await prisma.knowledgeItem.create({
    data: {
      organizationId: orgId,
      documentId: doc.id,
      title: doc.title,
      content: extracted,
      category: kind === "POLICY" ? "POLICY" : kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY",
      tags: tags.join(","),
      status: "ASSUMPTION",
    },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "DOCUMENT_CAPTURED",
    targetType: "Document",
    targetId: doc.id,
    detail: `${doc.title} classified as ${kind}${tags.length ? `, tagged ${tags.join(", ")}` : ""}`,
    metadata: { kind, tags, keywords: terms },
  });

  return { ok: true, docId: doc.id, kind, tags };
}
