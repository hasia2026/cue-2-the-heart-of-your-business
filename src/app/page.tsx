import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import ReviMark from "@/components/ReviMark";
import PublicHeader from "@/components/PublicHeader";
import type { DictKey } from "@/lib/i18n";

const LOOP: { n: string; titleKey: DictKey; descKey: DictKey; accent: string; glow: string }[] = [
  { n: "01", titleKey: "pillar.capture", descKey: "home.captureDesc", accent: "text-cyan-300", glow: "from-cyan-500/20" },
  { n: "02", titleKey: "pillar.understand", descKey: "home.understandDesc", accent: "text-violet-300", glow: "from-violet-500/20" },
  { n: "03", titleKey: "pillar.enhance", descKey: "home.enhanceDesc", accent: "text-fuchsia-300", glow: "from-fuchsia-500/20" },
  { n: "04", titleKey: "pillar.execute", descKey: "home.executeDesc", accent: "text-orange-300", glow: "from-orange-500/20" },
  { n: "05", titleKey: "pillar.expand", descKey: "home.expandDesc", accent: "text-emerald-300", glow: "from-emerald-500/20" },
];

// The /compare capability checklist, mirrored on the landing page. Columns are
// intentionally generic ("your CRM / FSM tools") — no competitor is named here;
// specifics live only on /compare.
const CHECKLIST: { cap: DictKey; crm: string; cue: string }[] = [
  { cap: "cmp.stores", crm: "✓", cue: "✓" },
  { cap: "cmp.finds", crm: "✗", cue: "✓" },
  { cap: "cmp.evidence", crm: "✗", cue: "✓" },
  { cap: "cmp.approve", crm: "—", cue: "✓" },
  { cap: "cmp.replaces", crm: "✗", cue: "✗" },
];

export default async function Home() {
  const session = await getSession();
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
      <div className="relative text-center">
        {/* Full-quality brand splash — the exact CUE logo art, dark + light variants.
            Which one shows follows the app theme (html.light), not the OS, and the
            light JPG's white background is blended into the page with multiply. */}
        <div className="mx-auto w-full max-w-xl">
          <img
            src="/cue-logo-dark.png"
            alt="CUE — The Heart of Your Business"
            width={1024}
            height={1024}
            className="cue-hero cue-hero-dark mx-auto h-auto w-full drop-shadow-glow"
          />
          <img
            src="/cue-logo-light.jpg"
            alt=""
            width={1024}
            height={1024}
            className="cue-hero cue-hero-light mx-auto h-auto w-full"
          />
        </div>
        {/* Revi — the mascot, perched at the top-right of the splash */}
        <div className="pointer-events-none absolute right-0 top-0 hidden md:block">
          <ReviMark className="h-14 w-14 drop-shadow-glow" />
        </div>
        {/* Visible headline removed — the logo art above already carries the brand line. Keep an sr-only h1 for structure/SEO. */}
        <h1 className="sr-only">CUE — The Heart of Your Business</h1>
        <p className="eyebrow -mt-2 mb-4">{t("home.eyebrow")}</p>
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

      {/* Capability checklist — no competitor names; specifics live on /compare */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-left">
              <th className="px-5 py-3 font-medium text-navy-300">{t("cmp.capCol")}</th>
              <th className="px-5 py-3 font-medium text-navy-300">{t("cmp.crmCol")}</th>
              <th className="px-5 py-3 font-semibold text-cue-blue">{t("cmp.cueCol")}</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST.map((r) => (
              <tr key={r.cap} className="border-t border-white/[0.06]">
                <td className="px-5 py-3 text-navy-100">{t(r.cap)}</td>
                <td className="px-5 py-3 text-navy-300">{r.crm}</td>
                <td className="px-5 py-3 font-medium text-white">{r.cue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-center">
        <a href="/compare" className="text-xs text-cue-blue hover:underline">{t("cmp.title")} →</a>
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
    </>
  );
}
