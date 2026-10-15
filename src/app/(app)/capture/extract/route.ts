// Image text extraction endpoint: runs the Groq vision OCR on an uploaded
// image, writes the extracted text into the document, re-classifies its
// kind/department suggestion, and builds knowledge items — the same pipeline
// a text capture goes through, so the item becomes searchable immediately.
// Bring-your-own-key: per-org Groq key (ai_settings) or server GROQ_API_KEY.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { classifyCapture, fileToFolder, FOLDER_FOR_KIND } from "@/lib/capture-classify";
import { extractImageText } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const orgId = session.organizationId as string;

  try {
    const form = await req.formData();
    const docId = String(form.get("docId") ?? "");
    const file = form.get("file");
    if (!docId) return NextResponse.json({ error: "No document id" }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const [doc] = await sql`
      select id, title, file_name from documents
      where id = ${docId} and organization_id = ${orgId}`;
    if (!doc) return NextResponse.json({ error: "Document not found in your organization." }, { status: 404 });

    const { text, model } = await extractImageText(file, orgId);
    if (!text) {
      return NextResponse.json({ error: "No readable text found in the image — it's saved as MEDIA." }, { status: 422 });
    }

    // Re-classify with the real content and file it into the matching folder.
    const cls = classifyCapture(`${doc.title} ${text}`);
    await sql`update documents set extracted_text = ${text.slice(0, 20000)}, kind = ${cls.kind}, status = 'PROCESSED' where id = ${doc.id}`;

    // Re-file into the auto folder for the new kind. If the doc was manually
    // moved to a folder that is NOT an auto-folder, leave it (manual wins);
    // otherwise follow the classification (e.g. MEDIA image → Invoices folder).
    const [current] = await sql`
      select dp.name as folder from documents d
      left join departments dp on dp.id = d.department_id
      where d.id = ${doc.id}`;
    const autoFolders = Object.values(FOLDER_FOR_KIND) as string[];
    const currentIsAuto = !current?.folder || autoFolders.includes(String(current.folder));
    if (currentIsAuto) {
      const folder = await fileToFolder(orgId, cls.kind);
      if (folder) await sql`update documents set department_id = ${folder.id} where id = ${doc.id}`;
    }

    // Knowledge items from the extracted content (dedupe by title).
    const [existing] = await sql`
      select id from knowledge_items where document_id = ${doc.id} limit 1`;
    if (!existing) {
      await sql`
        insert into knowledge_items (organization_id, document_id, title, content, category, tags, status)
        values (${orgId}, ${doc.id}, ${doc.title}, ${text.slice(0, 20000)},
          ${cls.kind === "POLICY" ? "POLICY" : cls.kind === "PROCEDURE" ? "PROCEDURE" : "HISTORY"},
          ${cls.tags.join(",")}, 'ASSUMPTION')`;
    }

    await logAudit({
      organizationId: orgId,
      actorId: session.user.id,
      action: "DOCUMENT_EXTRACTED",
      targetType: "Document",
      targetId: doc.id,
      detail: `OCR via ${model}; classified ${cls.kind}${cls.tags.length ? `, tagged ${cls.tags.join(", ")}` : ""}`,
      metadata: { model, kind: cls.kind, tags: cls.tags, chars: text.length },
    });

    revalidatePath("/capture");
    revalidatePath("/knowledge");
    return NextResponse.json({ ok: true, kind: cls.kind, tags: cls.tags, chars: text.length, model });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
