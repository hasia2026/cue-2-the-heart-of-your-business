// Shared post-OCR processing: write extracted text into a document, re-classify,
// re-file into the auto folder, and grow knowledge items. One home so the
// /capture/extract route (server Groq vision) and the applyOcrText server
// action (client-side Tesseract fallback) behave identically.
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { classifyCapture, fileToFolder, FOLDER_FOR_KIND } from "@/lib/capture-classify";

export async function applyExtractedText(opts: {
  orgId: string;
  actorId: string;
  docId: string;
  title: string;
  text: string;
  model: string;
}): Promise<{ ok: true; kind: string; tags: string[]; folder: string | null; chars: number }> {
  const { orgId, actorId, docId, title, text, model } = opts;
  const clipped = text.slice(0, 20000);

  // Re-classify with the real content and file it into the matching folder.
  const cls = classifyCapture(`${title} ${clipped}`);
  await sql`
    update documents set extracted_text = ${clipped}, kind = ${cls.kind}, status = 'PROCESSED'
    where id = ${docId} and organization_id = ${orgId}`;

  // Re-file into the auto folder for the new kind. If the doc was manually
  // moved to a folder that is NOT an auto-folder, leave it (manual wins);
  // otherwise follow the classification (e.g. MEDIA image → Invoices folder).
  const [current] = await sql`
    select dp.name as folder from documents d
    left join departments dp on dp.id = d.department_id
    where d.id = ${docId} and d.organization_id = ${orgId}`;
  const autoFolders = [...new Set(Object.values(FOLDER_FOR_KIND))] as string[];
  const currentIsAuto = !current?.folder || autoFolders.includes(String(current.folder));
  let filedTo: string | null = current?.folder ? String(current.folder) : null;
  if (currentIsAuto) {
    const folder = await fileToFolder(orgId, cls.kind);
    if (folder) {
      await sql`update documents set department_id = ${folder.id} where id = ${docId}`;
      filedTo = folder.name;
    }
  }

  // Knowledge items from the extracted content (dedupe by document link).
  const [existing] = await sql`
    select id from knowledge_items where document_id = ${docId} limit 1`;
  if (!existing) {
    await sql`
      insert into knowledge_items (organization_id, document_id, title, content, category, tags, status)
      values (${orgId}, ${docId}, ${title}, ${clipped},
        ${cls.kind === "POLICY" ? "POLICY" : cls.kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY"},
        ${cls.tags.join(",")}, 'ASSUMPTION')`;
  }

  await logAudit({
    organizationId: orgId,
    actorId,
    action: "DOCUMENT_EXTRACTED",
    targetType: "Document",
    targetId: docId,
    detail: `OCR via ${model}; classified ${cls.kind}${cls.tags.length ? `, tagged ${cls.tags.join(", ")}` : ""}`,
    metadata: { model, kind: cls.kind, tags: cls.tags, chars: clipped.length },
  });

  return { ok: true, kind: cls.kind, tags: cls.tags, folder: filedTo, chars: clipped.length };
}
