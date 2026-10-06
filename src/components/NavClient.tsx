"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; icon: string };

export default function NavClient({ groups }: { groups: { title: string; items: NavItem[] }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.07] bg-ink-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-white">
          <LogoMark className="h-6 w-6" /> CUE
        </Link>
        <button onClick={() => setOpen(!open)} className="btn-ghost !px-3 !py-1.5" aria-label="Menu">
          {open ? "✕" : "☰"}
        </button>
      </div>

      <aside
        className={`${open ? "block" : "hidden"} lg:block fixed lg:sticky inset-x-0 top-[52px] lg:top-0 z-30 h-[calc(100vh-52px)] lg:h-screen w-64 shrink-0 overflow-y-auto border-e border-white/[0.07] bg-ink-950/95 lg:bg-transparent px-3 py-4`}
      >
        <div className="mb-6 hidden items-center gap-2.5 px-2 lg:flex">
          <span className="cue-halo inline-flex">
            <LogoMark className="h-9 w-9" />
          </span>
          <div>
            <div className="font-bold leading-none text-white">CUE</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.3em] text-violet-300/80">The Heart of Your Business</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.title} className="mb-5">
            <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-navy-300/70">{g.title}</div>
            <nav className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                      active ? "bg-violet-500/15 font-semibold text-violet-200 shadow-glow" : "text-navy-100/80 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
      {open && <div className="fixed inset-0 top-[52px] z-20 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="cueg" x1="8" y1="56" x2="56" y2="8">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="0.5" stopColor="#A855F7" />
          <stop offset="1" stopColor="#FB923C" />
        </linearGradient>
        <radialGradient id="cueheart" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDBA74" />
          <stop offset="1" stopColor="#F97316" />
        </radialGradient>
      </defs>
      {/* Outer circle — the whole business system */}
      <circle cx="32" cy="32" r="27" stroke="url(#cueg)" strokeWidth="2" opacity="0.9" />
      {/* Inner triangle — Capture, Understand, Execute vertices */}
      <path d="M32 10 L52.5 44.5 L11.5 44.5 Z" stroke="url(#cueg)" strokeWidth="1.6" opacity="0.8" />
      {/* Heart at the center — the point of the whole system */}
      <path
        d="M32 27.4c-2.2-2.6-6-2-6.9.9-.8 2.6 1.2 4.7 6.9 8.3 5.7-3.6 7.7-5.7 6.9-8.3-.9-2.9-4.7-3.5-6.9-.9Z"
        fill="url(#cueheart)"
      />
    </svg>
  );
}
