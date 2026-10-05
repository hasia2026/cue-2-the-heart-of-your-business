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
        <div className="mb-6 hidden items-center gap-2 px-2 lg:flex">
          <LogoMark className="h-7 w-7" />
          <div>
            <div className="font-bold leading-none text-white">CUE</div>
            <div className="text-[10px] uppercase tracking-widest text-navy-300">Business OS</div>
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
                      active ? "bg-cue-blue/15 font-semibold text-cue-blue" : "text-navy-100/80 hover:bg-white/[0.05] hover:text-white"
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
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="cueg" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#2E8BFF" />
          <stop offset="0.55" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <path
        d="M23 9a9 9 0 1 0 0 14"
        stroke="url(#cueg)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="24.5" cy="16" r="3.5" fill="url(#cueg)" />
    </svg>
  );
}
