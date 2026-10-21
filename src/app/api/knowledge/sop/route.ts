import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";
import { assembleSopContent, transcribedToSteps } from "@/lib/sop";
import { logAudit } from "@/lib/audit";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Voice SOP prototype: a recorded walkthrough becomes a step-by-step
 * PROCEDURE in Knowledge. Audio in (≤ 24 MB, same cap as capture), transcript
 * out, deterministic step drafting (no LLM dependency), owner edits in the
 * Knowledge page afterwards. Writes one knowledge_items row — org-scoped and
 * audited like every other record.
 */
export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }
    if (file.size > 24 * 1024 * 1024) {
      return NextResponse.json({ error: "Recording too large (max ~24 MB)" }, { status: 413 });
    }
    const titleInput = String(form.get("title") ?? "").trim().slice(0, 120);

    const { text: transcript, provider } = await transcribeAudio(file, session.organizationId);
    const steps = transcribedToSteps(transcript);

    // Title: what the owner said it is, else "Procedure — <first words>".
    const title = titleInput || "Procedure — " + (steps[0] ?? "recorded walkthrough").slice(0, 60);
    const content = assembleSopContent(title, steps, transcript);

    const [item] = await sql`
      insert into knowledge_items (organization_id, title, content, category, tags, status)
      values (${session.organizationId}, ${title}, ${content}, 'PROCEDURE', 'sop,voice', 'FACT')
      returning id, title, content`;

    await logAudit({
      organizationId: session.organizationId,
      actorType: "USER",
      actorId: session.user.id,
      action: "SOP_RECORDED",
      targetType: "KnowledgeItem",
      targetId: item.id,
      detail: title,
      metadata: { provider, steps: steps.length },
    });

    return NextResponse.json({ id: item.id, title: item.title, steps, provider, content: item.content });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SOP generation failed";
    // Honest status mapping: missing Groq key = 503 (setup, not a bug),
    // wrong request shape = 400, everything else upstream = 502.
    const status = /not configured/i.test(message) ? 503 : /content-type/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
