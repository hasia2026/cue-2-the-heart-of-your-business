import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import NavClient, { LogoMark } from "./NavClient";
import LanguageSwitcher from "./LanguageSwitcher";
import { signOut } from "@/app/signin/actions";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { locale, rtl, t } = await getT();

  const groups = [
    {
      title: "Command",
      items: [
        { href: "/dashboard", label: t("nav.dashboard"), icon: "◎" },
        { href: "/compass", label: t("nav.compass"), icon: "✧" },
        { href: "/signals", label: t("nav.signals"), icon: "◉" },
      ],
    },
    {
      title: "Knowledge loop",
      items: [
        { href: "/capture", label: t("nav.capture"), icon: "⤓" },
        { href: "/understand", label: t("nav.understand"), icon: "◈" },
        { href: "/knowledge", label: t("nav.knowledge"), icon: "❑" },
        { href: "/enhance", label: t("nav.enhance"), icon: "✦" },
      ],
    },
    {
      title: "Operate",
      items: [
        { href: "/pipeline", label: t("nav.pipeline"), icon: "⇉" },
        { href: "/execute", label: t("nav.execute"), icon: "▶" },
        { href: "/report", label: t("nav.report"), icon: "▤" },
        { href: "/people", label: t("nav.people"), icon: "☰" },
        { href: "/expand", label: t("nav.expand"), icon: "↑" },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/lab", label: t("nav.lab"), icon: "⚗" },
        { href: "/ecosystem", label: t("nav.ecosystem"), icon: "⊂" },
        { href: "/settings", label: t("nav.settings"), icon: "⚙" },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen" dir={rtl ? "rtl" : "ltr"} lang={locale}>
      <NavClient groups={groups} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 hidden items-center gap-3 border-b border-white/[0.07] bg-ink-950/70 px-6 py-3 backdrop-blur lg:flex">
          <div className="text-sm text-navy-300">{t("app.tagline")}</div>
          <div className="ms-auto flex items-center gap-2">
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
          </div>
        </footer>
      </div>
    </div>
  );
}
