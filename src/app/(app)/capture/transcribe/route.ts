// Groq whisper-large-v3 transcription for voice capture (m4a/mp3/wav/mp4/webm).
// Bring-your-own-key: per-org Groq key (ai_settings) or server GROQ_API_KEY.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let orgId = "";
  try {
    const s = await requireSession();
    orgId = s.organizationId as string;
  } catch {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  void orgId; // consumed inside transcribeAudio's own key resolution
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }
    if (file.size > 24 * 1024 * 1024) {
      return NextResponse.json({ error: "Recording too large (max ~24 MB)" }, { status: 413 });
    }
    const { text, provider } = await transcribeAudio(file, orgId);
    return NextResponse.json({ text, provider });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transcription failed";
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
