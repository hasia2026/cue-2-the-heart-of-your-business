"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, isLocale, isRtl, translator, type DictKey, type Locale } from "@/lib/i18n";

/** Client-side locale hook mirroring the server cookie state. */
export function useLocale() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=(\\w+)`));
    if (m && isLocale(m[1])) setLocale(m[1]);
  }, []);

  return { locale, rtl: isRtl(locale), t: translator(locale) };
}
