import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { sql } from "@/lib/db";
import { NAV_TOAST_KEYS, buildLabels } from "@/lib/i18nKeys";
import NavClient, { LogoMark } from "./NavClient";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import TextSizePicker from "./TextSizePicker";
import ReviMark from "./ReviMark";
import { signOut } from "@/app/signin/actions";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { locale, rtl, t } = await getT();

  // ── Loop pulse: open work awaiting attention, per loop parent ──
  // Counts stay 0 for signed-out visitors and empty/prospect orgs; pulse
  // badges render only for real open items, never fabricated.
  const s = session;
  let pulse = { capture: 0, understand: 0, enhance: 0, execute: 0, expand: 0 };
  if (s) {
    const [oi, pa, at] = await Promise.all([
      sql`select count(*)::int as n from insights where organization_id = ${s.organizationId} and status = 'OPEN'`,
      sql`select count(*)::int as n from recommendations where organization_id = ${s.organizationId} and status = 'PENDING'`,
      sql`select count(*)::int as n from tasks where organization_id = ${s.organizationId} and status in ('OPEN', 'IN_PROGRESS')`,
    ]);
    pulse = {
      capture: 0,
      understand: Number(oi[0]?.n ?? 0),
      enhance: Number(pa[0]?.n ?? 0),
      execute: Number(at[0]?.n ?? 0),
      expand: 0,
    };
  }
  const toastLabels = buildLabels(NAV_TOAST_KEYS, t);

  const groups = [
    {
      title: "Command",
      items: [
        { href: "/dashboard", label: t("nav.dashboard"), icon: "◎" },
        { href: "/intake", label: t("nav.intake"), icon: "⇥", children: [{ href: "/intake/import", label: t("nav.import") }] },
      ],
    },
    {
      // The five loops — each loop is a parent, its modules nest beneath it.
      title: "",
      items: [
        {
          href: "/capture",
          label: t("nav.capture"),
          icon: "⤓",
          children: [{ href: "/signals", label: t("nav.signals") }],
        },
        {
          href: "/understand",
          label: t("nav.understand"),
          icon: "◈",
          pulse: pulse.understand,
          children: [
            { href: "/compass", label: t("nav.compass") },
            { href: "/knowledge", label: t("nav.knowledge") },
          ],
        },
        {
          href: "/enhance",
          label: t("nav.enhance"),
          icon: "✦",
          pulse: pulse.enhance,
        },
        {
          href: "/execute",
          label: t("nav.execute"),
          icon: "▶",
          pulse: pulse.execute,
          children: [
            { href: "/pipeline", label: t("nav.pipeline") },
            { href: "/report", label: t("nav.report") },
            { href: "/people", label: t("nav.people") },
          ],
        },
        {
          href: "/expand",
          label: t("nav.expand"),
          icon: "↑",
          children: [{ href: "/lab", label: t("nav.lab") }],
        },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/ecosystem", label: t("nav.ecosystem"), icon: "⊂" },
        { href: "/settings", label: t("nav.settings"), icon: "⚙" },
      ],
    },
  ];

  return (
    // Mobile: top bar stacks above content (column); desktop: sidebar + content row
    <div className="flex min-h-screen flex-col lg:flex-row" dir={rtl ? "rtl" : "ltr"} lang={locale}>
      <NavClient
        groups={groups}
        toastLabels={toastLabels}
        signedIn={!!session}
        signOutAction={signOut}
        signOutLabel={t("app.signOut")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 hidden items-center gap-3 border-b border-white/[0.07] bg-ink-950/70 px-6 py-3 backdrop-blur lg:flex">
          <div className="text-sm text-navy-300">{t("app.tagline")}</div>
          <div className="ms-auto flex items-center gap-2">
            <TextSizePicker compact />
            <ThemeToggle />
            <LanguageSwitcher />
            {session ? (
              <form action={signOut}>
                <button className="btn-ghost !px-3 !py-1.5 text-xs">{t("app.signOut")}</button>
              </form>
            ) : (
              <a href="/signin" className="btn-primary !px-3 !py-1.5 text-xs">{t("app.signIn")}</a>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <footer className="border-t border-white/[0.06] px-6 py-4 text-xs text-navy-300/60">
          <div className="flex items-center gap-2">
            <LogoMark className="h-4 w-4" /> CUE — Built by HASI Technologies
            <ReviMark className="ms-2 h-5 w-5" />
            <span className="text-navy-300/60">Revi is always watching for leaks.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
