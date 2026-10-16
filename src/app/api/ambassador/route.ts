import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ambassadorAnswer } from "@/lib/ambassador";
import { isLocale, translator, type Locale } from "@/lib/i18n";
import { rateLimitResult, clientKey } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : null;
  if (!question) return NextResponse.json({ error: "Invalid question" }, { status: 400 });

  const session = await getSession();
  if (!session) {
    // Public path still costs tokens (LLM only fires authenticated, but the
    // grounded engine + render is not free) — 20/min/IP per visitor.
    const pub = rateLimitResult(clientKey(req, "ambassador-pub"), 20, 60_000);
    if (!pub.ok) {
      return NextResponse.json(
        { error: "Too many questions — try again shortly." },
        { status: 429, headers: { "retry-after": String(pub.retryAfterSecs) } },
      );
    }
    // Public visitor: introduce CUE and route to the funnel — no fabricated facts.
    const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
    return NextResponse.json({
      answer: translator(locale)("amb.publicIntro"),
      mode: "public",
      suggestions: [translator(locale)("amb.s4")],
    });
  }

  const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
  // Authenticated path can hit a real LLM (org key or deployment default) —
  // 20/min/org. A normal ask-back session is a question every few seconds
  // at most; loops get 429 before burning the free tier.
  const rl = rateLimitResult(`ambassador:${session.organizationId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many questions — try again shortly." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }
  return NextResponse.json(await ambassadorAnswer(session.organizationId, question, locale));
}
