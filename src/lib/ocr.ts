// Groq vision OCR (qwen3.8-27b, preview). Same key pattern as transcription:
// a per-org Groq key (Settings → AI Ambassador) wins, the server
// GROQ_API_KEY is the fallback, otherwise the caller gets an honest
// "not configured" error — no fake extraction, no other provider swapped in.
import { getGroqKey } from "@/lib/transcribe";

export type OcrResult = { text: string; model: string };

const OCR_MODEL = "qwen/qwen3.8-27b";
const MAX_BYTES = 16 * 1024 * 1024; // base64 overhead; stays under Groq's 20 MB request cap

const PROMPT = `Read all visible text in this image. Transcribe it exactly — preserve headings, lists, tables (as markdown), dollar amounts, names, dates, and labels. If the image contains no readable text, reply with NONE. Do not add commentary or summarize.`;

export async function extractImageText(file: File, orgId: string): Promise<OcrResult> {
  const key = (await getGroqKey(orgId)) ?? process.env.GROQ_API_KEY ?? null;
  if (!key) {
    throw new Error("Groq key not configured — the client falls back to on-device OCR; save a Groq key in Settings → AI Ambassador or set GROQ_API_KEY for the most accurate reads");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image too large for extraction (max ~16 MB)");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = (j.choices?.[0]?.message?.content ?? "").trim();
  const text = raw === "NONE" || !raw ? "" : raw;
  return { text, model: OCR_MODEL };
}
