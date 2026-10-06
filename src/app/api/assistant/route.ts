import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { answerQuestion } from "@/lib/assistant";
import { isLocale, type Locale } from "@/lib/i18n";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : null;
  if (!question) return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  const locale: Locale = isLocale(body?.locale) ? body.locale : "en";
  return NextResponse.json(await answerQuestion(session.organizationId, question, locale));
}
