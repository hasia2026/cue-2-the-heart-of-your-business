// Groq transcription (whisper-large-v3). Key resolution mirrors the
// Ambassador pattern: a per-org Groq key (Settings → AI Ambassador) wins,
// the server GROQ_API_KEY is the fallback, otherwise the caller gets an
// honest "not configured" error — no fake transcription, no other
// provider silently swapped in.
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/secretbox";

export type TranscribeResult = { text: string; provider: "groq" };

export async function getGroqKey(orgId: string): Promise<string | null> {
  const [row] = await sql`select ambassador_provider, ambassador_key_enc from ai_settings where organization_id = ${orgId}`;
  if (row?.ambassador_provider === "groq" && row?.ambassador_key_enc) {
    return decryptSecret(row.ambassador_key_enc as string);
  }
  return process.env.GROQ_API_KEY || null;
}

export async function transcribeAudio(file: File, orgId: string): Promise<TranscribeResult> {
  const key = (await getGroqKey(orgId)) ?? process.env.GROQ_API_KEY ?? null;
  if (!key) {
    throw new Error("Transcription not configured — save a Groq key in Settings → AI Ambassador or set GROQ_API_KEY");
  }
  const fd = new FormData();
  // Whisper infers format from extension; MediaRecorder gives webm/m4a,
  // both accepted by whisper-large-v3.
  fd.append("file", file, file.name || "recording.webm");
  fd.append("model", "whisper-large-v3");
  fd.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { text?: string };
  const text = (j.text ?? "").trim();
  if (!text) throw new Error("Transcription returned no text");
  return { text, provider: "groq" };
}
