import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";

export async function POST(req: NextRequest) {
  const { locale } = await req.json().catch(() => ({ locale: undefined }));
  if (!isLocale(locale)) return NextResponse.json({ error: "unsupported locale" }, { status: 400 });
  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 31536e3 });
  return res;
}
