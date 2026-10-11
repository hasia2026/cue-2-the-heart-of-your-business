"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./useLocale";
import type { Locale } from "@/lib/i18n";

const OPTIONS: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ar", label: "ع" },
  { code: "es", label: "ES" },
  { code: "vi", label: "VI" },
];

/** Compact language pills — persist via the locale cookie and refresh server text. */
export default function LanguageSwitcher() {
  const { locale } = useLocale();
  const [saving, setSaving] = useState(false);

  // Sync once the cookie has been read client-side (server already stamped <html lang>).
  const [active, setActive] = useState<Locale>("en");
  useEffect(() => setActive(locale), [locale]);

  async function pick(code: Locale) {
    if (code === active || saving) return;
    setActive(code);
    setSaving(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: code }),
      });
      // Full reload so client components (AmbassadorWidget inclu.) re-read the
      // cookie — router.refresh() alone leaves already-mounted widgets stale.
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5"
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          onClick={() => pick(o.code)}
          disabled={saving}
          aria-pressed={active === o.code}
          title={o.code === "ar" ? "العربية" : o.code === "es" ? "Español" : o.code === "vi" ? "Tiếng Việt" : "English"}
          className={`rounded-full px-2 py-1 text-[11px] font-semibold leading-none transition ${
            active === o.code ? "bg-violet-500/30 text-white" : "text-navy-300 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
