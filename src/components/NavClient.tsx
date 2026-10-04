"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import CueAI from "./CueAI";
import { LANGUAGES, isRtl, translate, type Locale } from "@/lib/i18n";

const NAV = (t: (k: string) => string) => [
  { section: t("nav.overview"), items: [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "◈" },
    { href: "/compass", label: t("nav.compass"), icon: "✦" },
    { href: "/pipeline", label: t("nav.crm"), icon: "⇉" },
  ]},
  { section: t("nav.pipeline"), items: [
    { href: "/capture", label: t("nav.capture"), icon: "⤓" },
    { href: "/understand", label: t("nav.understand"), icon: "◉" },
    { href: "/enhance", label: t("nav.enhance"), icon: "✧" },
    { href: "/execute", label: t("nav.execute"), icon: "▶" },
    { href: "/expand", label: t("nav.expand"), icon: "↗" },
  ]},
  { section: t("nav.company"), items: [
    { href: "/messages", label: t("nav.messages"), icon: "✉" },
    { href: "/signals", label: t("nav.signals"), icon: "📡" },
    { href: "/people", label: t("nav.people"), icon: "◍" },
    { href: "/knowledge", label: t("nav.knowledge"), icon: "❑" },
    { href: "/lab", label: t("nav.lab"), icon: "⚗" },
    { href: "/ecosystem", label: t("nav.ecosystem"), icon: "⇄" },
    { href: "/settings", label: t("nav.settings"), icon: "⚙" },
  ]},
];

export default function NavClient({
  orgName,
  userName,
  pendingRecs,
  openTasks,
  unreadMsgs,
  newSignals,
  leadsWaiting,
  locale,
}: {
  orgName: string;
  userName: string;
  pendingRecs: number;
  openTasks: number;
  unreadMsgs: number;
  newSignals: number;
  leadsWaiting: number;
  locale: Locale;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const t = (k: string) => translate(locale, k);
  const nav = NAV(t);
  const rtl = isRtl(locale);

  const badgeFor = (href: string) =>
    href === "/understand" && pendingRecs > 0 ? pendingRecs :
    href === "/execute" && openTasks > 0 ? openTasks :
    href === "/messages" && unreadMsgs > 0 ? unreadMsgs :
    href === "/signals" && newSignals > 0 ? newSignals :
    href === "/pipeline" && leadsWaiting > 0 ? leadsWaiting : null;

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-ink-900/90 backdrop-blur border-b border-navy-100 flex items-center px-4">
        <button onClick={() => setOpen(!open)} className="text-2xl leading-none text-navy-700" aria-label="Menu">☰</button>
        <Link href="/dashboard" className="ml-3 font-semibold text-navy-900">CUE</Link>
        <button onClick={() => setLangOpen(!langOpen)} className="ml-2 text-xs text-navy-400" aria-label="Language">
          {LANGUAGES.find((l) => l.code === locale)?.flag}
        </button>
        {langOpen && (
          <div className="fixed top-14 left-4 z-50 card p-1.5 w-44">
            {LANGUAGES.map((l) => (
              <a key={l.code} href={`?lang=${l.code}`} onClick={(e) => { e.preventDefault(); document.cookie = `cue_locale=${l.code}; path=/; max-age=31536000`; location.reload(); }} className={`block px-2.5 py-1.5 rounded-lg text-sm ${l.code === locale ? "text-accent-blue" : "text-navy-600"}`}>
                {l.flag} {l.label}
              </a>
            ))}
          </div>
        )}
        <button onClick={() => setAiOpen(true)} className="ml-auto ai-chip">✦ CUE AI</button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 z-40 w-64 bg-ink-900/80 backdrop-blur border-r border-navy-100 flex flex-col transition-transform duration-200 lg:!translate-x-0 ${rtl ? "rtl-side" : "left-0"} ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-navy-50">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange flex items-center justify-center text-white font-bold shadow-glow">B</div>
          <div className="min-w-0">
            <div className="font-semibold text-navy-900 leading-tight">CUE</div>
            <div className="text-[11px] text-navy-400 truncate">{orgName}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {nav.map((group) => (
            <div key={group.section}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-navy-300">
                {group.section}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const badge = badgeFor(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                        active
                          ? "bg-gradient-to-r from-accent-blue/20 to-accent-purple/10 text-white font-medium border border-accent-blue/30 shadow-glow"
                          : "text-navy-500 hover:bg-white/[0.05] hover:text-navy-800 border border-transparent"
                      }`}
                    >
                      <span className={active ? "text-blue-300" : "text-navy-300"}>{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {badge !== null && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent-orange text-white text-[11px] font-semibold flex items-center justify-center shadow-glow">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-50 space-y-1">
          <button
            onClick={() => setAiOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-accent-blue to-accent-purple hover:opacity-90 transition-opacity shadow-glow"
          >
            {t("nav.askAi")}
          </button>
          <form action="/api/auth/signout" method="post">
            <button className="w-full text-left rounded-xl px-3 py-2 text-sm text-navy-400 hover:bg-white/[0.05] hover:text-navy-700">
              {t("nav.signOut")} · {userName}
            </button>
          </form>
        </div>
      </aside>

      {open && <div className="lg:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setOpen(false)} />}

      <CueAI open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
