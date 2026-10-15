// Image text extraction endpoint (primary OCR): runs the Groq vision model
// on an uploaded image and passes the text through applyExtractedText —
// reclassifies, files into the auto folder, and builds knowledge items so
// the document is searchable immediately. Bring-your-own-key: per-org Groq
// key (ai_settings) or server GROQ_API_KEY. With no key configured the
// client falls back to on-device Tesseract OCR (free, no key) — this route
// answers 503 so the client knows when to do that.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { applyExtractedText } from "@/lib/ocr-apply";
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

    const applied = await applyExtractedText({
      orgId,
      actorId: session.user.id,
      docId: doc.id as string,
      title: doc.title as string,
      text,
      model,
    });

    revalidatePath("/capture");
    revalidatePath("/knowledge");
    return NextResponse.json({ ok: true, kind: applied.kind, tags: applied.tags, chars: applied.chars, model, folder: applied.folder });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    // 503 = not configured (client should try the on-device fallback),
    // 502 = provider error.
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
