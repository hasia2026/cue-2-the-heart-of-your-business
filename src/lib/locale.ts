import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, isRtl, translate, type Locale } from "./i18n";

/** Read the user's locale from the cookie (server components/actions). */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Convenience: `t("nav.dashboard")` inside server components. */
export async function getT(): Promise<(key: string) => string> {
  const locale = await getLocale();
  return (key: string) => translate(locale, key);
}

/** True when the active locale reads right-to-left (e.g. Arabic). */
export async function isRtlLocale(): Promise<boolean> {
  return isRtl(await getLocale());
}
