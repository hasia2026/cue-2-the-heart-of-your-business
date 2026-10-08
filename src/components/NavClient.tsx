"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export type NavChild = { href: string; label: string };
export type NavItem = { href: string; label: string; icon: string; pulse?: number; children?: NavChild[] };

export type NavGroup = { title: string; items: NavItem[] };

export default function NavClient({
  groups,
  toastLabels = {},
  signedIn = false,
  signOutAction,
  signOutLabel = "Sign out",
}: {
  groups: NavGroup[];
  toastLabels?: Record<string, string>;
  signedIn?: boolean;
  signOutAction?: () => Promise<void>;
  signOutLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // What the pulse means, per loop — shown as the badge tooltip.
  const toastFor = (item: NavItem) => {
    if (item.href === "/understand" && (item.pulse ?? 0) > 0) return toastLabels["nav.toasts.newInsight"];
    if (item.href === "/enhance" && (item.pulse ?? 0) > 0) return toastLabels["nav.toasts.newApproval"];
    if (item.href === "/execute" && (item.pulse ?? 0) > 0) return toastLabels["nav.toasts.newTask"];
    return undefined;
  };

  return (
    <>
      {/* Mobile top bar — root is flex-col on mobile, so this owns a full-width row and sticky engages */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.07] bg-ink-950/80 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-white">
          <LogoMark className="h-6 w-6" /> CUE
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn && signOutAction && (
            <form action={signOutAction}>
              <button className="btn-ghost !px-3 !py-1.5 text-xs">{signOutLabel}</button>
            </form>
          )}
          <button onClick={() => setOpen(!open)} className="btn-ghost !px-3 !py-1.5" aria-label="Menu">
            {open ? "✕" : "☰"}
          </button>
        </div>
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
            {g.title ? (
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-navy-300/70">{g.title}</div>
            ) : null}
            <nav className="space-y-0.5">
              {g.items.map((item) => {
                const selfActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const children = item.children ?? [];
                const childActive = children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                        selfActive
                          ? "bg-violet-500/15 font-semibold text-violet-200 shadow-glow"
                          : childActive
                            ? "bg-white/[0.04] font-medium text-white"
                            : "text-navy-100/80 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {(item.pulse ?? 0) > 0 && (
                        <span
                          className="ms-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cue-red/90 px-1.5 text-[10px] font-bold leading-none text-white"
                          title={toastFor(item)}
                        >
                          {(item.pulse ?? 0) > 9 ? "9+" : item.pulse}
                        </span>
                      )}
                    </Link>
                    {children.length > 0 && (
                      <div className="mb-1 ms-[19px] mt-0.5 space-y-0.5 border-s border-white/[0.08] ps-3">
                        {children.map((c) => {
                          const active = pathname === c.href || pathname.startsWith(c.href + "/");
                          return (
                            <Link
                              key={c.href}
                              href={c.href}
                              onClick={() => setOpen(false)}
                              className={`block rounded-lg px-2 py-1.5 text-[13px] transition ${
                                active
                                  ? "bg-violet-500/10 font-semibold text-violet-200"
                                  : "text-navy-100/60 hover:bg-white/[0.04] hover:text-white"
                              }`}
                            >
                              {c.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
