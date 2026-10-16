import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { answerQuestion } from "@/lib/assistant";
import { isLocale, type Locale } from "@/lib/i18n";
import { rateLimitResult, clientKey } from "@/lib/rate-limit";

export async function POST(req: Request) {
  // Per-org abuse guard: the route calls no LLM directly, but Drafter+runners
  // fan out per question — 30/min/org is generous for a human, hostile to a loop.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimitResult(`assistant:${session.organizationId}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many assistant questions — try again shortly." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : null;
  if (!question) return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
  return NextResponse.json(await answerQuestion(session.organizationId, question, locale));
}
