import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { computeLeakScore, QUESTIONS, REVENUE_BRACKETS, type AnswerIndex } from "@/lib/leak-score";
import { rateLimitResult, clientKey } from "@/lib/rate-limit";

const answerSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const bodySchema = z.object({
  email: z.string().email().max(200),
  businessName: z.string().max(200).optional(),
  industry: z.string().max(60).optional(),
  revenueBracket: z.string().max(30),
  answers: z.record(z.string().max(40), answerSchema),
});

export async function POST(req: Request) {
  // Public, anonymous lead capture that writes a DB row — 5/hour/IP is a
  // generous ceiling for a human answering the 60-second form once.
  const rl = rateLimitResult(clientKey(req, "score"), 5, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete every question and use a valid email." }, { status: 400 });
  }
  const { email, businessName, industry, revenueBracket, answers } = parsed.data;

  // Sanitize: every known question gets a valid index (default healthy = 3)
  const clean: Record<string, AnswerIndex> = {};
  for (const q of QUESTIONS) {
    const v = (answers as Record<string, unknown>)[q.id];
    clean[q.id] = typeof v === "number" && [0, 1, 2, 3].includes(v) ? (v as AnswerIndex) : 3;
  }
  if (!REVENUE_BRACKETS.some((b) => b.key === revenueBracket)) {
    return NextResponse.json({ error: "Invalid revenue bracket" }, { status: 400 });
  }

  const result = computeLeakScore(clean, revenueBracket);

  try {
    await sql`
      insert into score_leads (email, business_name, industry, answers, score, top_leak, top_leak_value)
      values (${email.toLowerCase()}, ${businessName ?? null}, ${industry ?? null},
        ${sql.json({ ...clean, revenueBracket })}, ${result.score}, ${result.leakHours.name},
        ${result.leakHours.monthlyEstimate})`;
  } catch (e) {
    // Never block the result on a lead-capture write failure.
    console.error("score_leads insert failed", e);
  }

  return NextResponse.json(result);
}
