"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "vi", label: "VI" },
  { code: "ar", label: "AR" },
];

export default function LanguageSwitcher() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<string | null>(null);

  async function setLocale(code: string) {
    setCurrent(code);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: code }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex overflow-hidden rounded-xl border border-white/10" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          disabled={pending}
          className={`px-2 py-1 text-xs font-semibold transition ${
            (current ?? (typeof document !== "undefined" ? document.cookie.match(/cue_locale=(\w+)/)?.[1] ?? "en" : "en")) === l.code
              ? "bg-cue-blue text-white"
              : "text-navy-300 hover:bg-white/[0.06]"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
