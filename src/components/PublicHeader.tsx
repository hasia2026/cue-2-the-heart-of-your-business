"use client";

import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";

/** Shared public-pages header: logo, language pills, light/dark toggle. */
export default function PublicHeader() {
  return (
    <header className="border-b border-white/[0.07]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="flex items-center gap-2 font-bold text-white">
          <svg viewBox="0 0 64 64" fill="none" className="h-6 w-6" aria-hidden>
            <defs>
              <linearGradient id="cueg" x1="8" y1="56" x2="56" y2="8">
                <stop offset="0" stopColor="#38BDF8" />
                <stop offset="0.5" stopColor="#A855F7" />
                <stop offset="1" stopColor="#FB923C" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="27" stroke="url(#cueg)" strokeWidth="2" opacity="0.9" />
            <path d="M32 10 L52.5 44.5 L11.5 44.5 Z" stroke="url(#cueg)" strokeWidth="1.6" opacity="0.8" />
          </svg>
          CUE
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
