"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export default function LanguageSwitcher({
  current,
  compact,
}: {
  current: Locale;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function pick(code: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="h-8 px-2.5 rounded-lg border border-navy-50 bg-white/[0.04] text-xs text-navy-600 hover:bg-white/[0.08] flex items-center gap-1.5"
          aria-label="Language"
        >
          <span>{active.flag}</span>
          <span className="uppercase">{active.code}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-9 z-50 w-40 card p-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => pick(l.code)}
                disabled={pending}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left ${l.code === current ? "bg-accent-blue/15 text-white" : "text-navy-600 hover:bg-white/[0.06]"}`}
              >
                <span>{l.flag}</span> {l.label}
                {l.code === current && <span className="ml-auto text-accent-blue">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Large selector (sign-in / sign-up / onboarding)
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => pick(l.code)}
          disabled={pending}
          className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 transition-all ${
            l.code === current
              ? "border-accent-blue/50 bg-accent-blue/15 text-white"
              : "border-navy-50 bg-white/[0.03] text-navy-500 hover:text-navy-800 hover:bg-white/[0.07]"
          }`}
        >
          <span>{l.flag}</span> {l.label}
        </button>
      ))}
    </div>
  );
}
