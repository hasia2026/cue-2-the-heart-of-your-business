import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { LogoMark } from "@/components/NavClient";
import ReviMark from "@/components/ReviMark";
import type { DictKey } from "@/lib/i18n";

const LOOP: { n: string; titleKey: DictKey; descKey: DictKey; accent: string; glow: string }[] = [
  { n: "01", titleKey: "pillar.capture", descKey: "home.captureDesc", accent: "text-cyan-300", glow: "from-cyan-500/20" },
  { n: "02", titleKey: "pillar.understand", descKey: "home.understandDesc", accent: "text-violet-300", glow: "from-violet-500/20" },
  { n: "03", titleKey: "pillar.enhance", descKey: "home.enhanceDesc", accent: "text-fuchsia-300", glow: "from-fuchsia-500/20" },
  { n: "04", titleKey: "pillar.execute", descKey: "home.executeDesc", accent: "text-orange-300", glow: "from-orange-500/20" },
  { n: "05", titleKey: "pillar.expand", descKey: "home.expandDesc", accent: "text-emerald-300", glow: "from-emerald-500/20" },
];

export default async function Home() {
  const session = await getSession();
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      <div className="text-center">
        <div className="cue-halo mx-auto mb-6 inline-flex">
          <LogoMark className="h-20 w-20" />
        </div>
        {/* Revi — the mascot, perched on the headline */}
        <div className="relative mx-auto -mt-10 flex justify-end max-w-md md:max-w-2xl">
          <ReviMark className="h-14 w-14 drop-shadow-glow" />
        </div>
        <div className="eyebrow mb-4">{t("home.eyebrow")}</div>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          {t("home.titleA")}{" "}
          <span className="hero-gradient">{t("home.titleB")}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-navy-300 md:text-lg">
          {t("home.sub")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {session ? (
            <a href="/dashboard" className="btn-primary">{t("home.ctaOpen")}</a>
          ) : (
            <>
              <a href="/signup" className="btn-primary">{t("home.ctaStart")}</a>
              <a href="/signin" className="btn-ghost">{t("app.signIn")}</a>
            </>
          )}
        </div>
      </div>

      <div className="eyebrow mt-16 mb-4 text-center">{t("home.loopHead")}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LOOP.map((s) => (
          <div key={s.n} className="card card-hover relative overflow-hidden p-5">
            <div
              className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${s.glow} to-transparent blur-xl`}
            />
            <div className={`text-[11px] font-semibold tracking-[0.3em] ${s.accent}`}>{s.n}</div>
            <div className="mt-2 font-semibold text-white">{t(s.titleKey)}</div>
            <p className="muted mt-1 text-xs">{t(s.descKey)}</p>
          </div>
        ))}
      </div>

      <div className="card mt-12 p-6 text-center">
        <p className="muted text-sm">
          <span className="text-white">{t("home.packs").split("—")[0]}</span>
          {t("home.packs").includes("—") ? <>— {t("home.packs").split("—").slice(1).join("—")}</> : null}
        </p>
      </div>

      {/* The pledge */}
      <div className="card mt-6 p-6 text-center">
        <p className="text-sm text-navy-100">
          <span className="font-semibold text-white">{t("home.pledgeLead")}</span>{" "}
          {t("home.pledgeBody")}
        </p>
        <p className="muted mt-1 text-xs">{t("home.pledgeTail")}</p>
      </div>

      {/* Public leak-score hook */}
      <div className="mt-10 text-center">
        <a href="/score" className="btn-primary">{t("home.scoreCta")}</a>
      </div>
    </div>
  );
}
