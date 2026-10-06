import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ambassadorAnswer } from "@/lib/ambassador";
import { isLocale, translator, type Locale } from "@/lib/i18n";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : null;
  if (!question) return NextResponse.json({ error: "Invalid question" }, { status: 400 });

  const session = await getSession();
  if (!session) {
    // Public visitor: introduce CUE and route to the funnel — no fabricated facts.
    const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
    return NextResponse.json({
      answer: translator(locale)("amb.publicIntro"),
      mode: "public",
      suggestions: [translator(locale)("amb.s4")],
    });
  }

  const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
  return NextResponse.json(await ambassadorAnswer(session.organizationId, question, locale));
}
