import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import type { DictKey } from "@/lib/i18n";

const LOOP: { n: string; titleKey: DictKey; descKey: DictKey; accent: string; glow: string }[] = [
  { n: "01", titleKey: "pillar.capture", descKey: "capture.subtitle", accent: "text-cyan-300", glow: "from-cyan-500/20" },
  { n: "02", titleKey: "pillar.understand", descKey: "understand.subtitle", accent: "text-violet-300", glow: "from-violet-500/20" },
  { n: "03", titleKey: "pillar.enhance", descKey: "enhance.subtitle", accent: "text-fuchsia-300", glow: "from-fuchsia-500/20" },
  { n: "04", titleKey: "pillar.execute", descKey: "execute.subtitle", accent: "text-orange-300", glow: "from-orange-500/20" },
  { n: "05", titleKey: "pillar.expand", descKey: "expand.subtitle", accent: "text-emerald-300", glow: "from-emerald-500/20" },
];

// The /compare capability checklist, mirrored on the landing page. Columns are
// intentionally generic ("your CRM / FSM tools") — no competitor is named here;
// specifics live only on /compare.
const CHECKLIST: { cap: DictKey; crm: string; cue: string }[] = [
  { cap: "cmp.stores", crm: "✓", cue: "✓" },
  { cap: "cmp.finds", crm: "✗", cue: "✓" },
  { cap: "cmp.evidence", crm: "✗", cue: "✓" },
  { cap: "cmp.approve", crm: "—", cue: "✓" },
  { cap: "cmp.replaces", crm: "—", cue: "✓" },
];

export default async function Home() {
  const session = await getSession();
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
      <div className="relative text-center">
        {/* Full-quality brand splash — the exact CUE logo art, dark + light variants.
            Which one shows follows the app theme (html.light), not the OS, and the
            light JPG's white background is blended into the page with multiply. */}
        <div className="mx-auto w-full max-w-[240px] md:max-w-[300px]">
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
        <p className="eyebrow -mt-2 mb-3">{t("home.eyebrow")}</p>
        <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight text-white md:text-5xl">
          {t("home.titleA")}{" "}
          <span className="bg-gradient-to-r from-cue-blue via-violet-400 to-cue-orange bg-clip-text text-transparent">
            {t("home.titleB")}
          </span>
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

      <div id="loop" className="eyebrow mt-16 mb-4 scroll-mt-24 text-center">{t("home.loopHead")}</div>
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

      <section className="mt-16">
        <div className="eyebrow mb-3 text-center">See it</div>
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="card overflow-hidden p-2">
            <img src="/screens/dashboard.png" alt="CUE business command center showing health, open leaks, and pending decisions" className="w-full rounded-lg border border-white/10" />
            <figcaption className="muted px-2 py-2 text-xs">The command center: business health, open leaks, and what needs your decision.</figcaption>
          </figure>
          <figure className="card overflow-hidden p-2">
            <img src="/screens/compass.png" alt="CUE Company Compass showing an explainable business health score with evidence" className="w-full rounded-lg border border-white/10" />
            <figcaption className="muted px-2 py-2 text-xs">Company Compass: every score carries its evidence, reasoning, and confidence.</figcaption>
          </figure>
        </div>
      </section>

      <section id="pricing" className="mt-16 scroll-mt-24">
        <div className="eyebrow mb-3 text-center">Pricing</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <div className="text-xs uppercase tracking-widest text-cue-blue">Pilot</div>
            <div className="mt-2 text-3xl font-bold text-white">Free</div>
            <p className="muted mt-2 text-sm">A 20-minute scan against your own records. If we don&apos;t find $1,000 in documented leaks, the pilot is free.</p>
            <a href="/book" className="btn-ghost mt-4 inline-block">Book the scan →</a>
          </div>
          <div className="card p-6">
            <div className="text-xs uppercase tracking-widest text-violet-300">Operator</div>
            <div className="mt-2 text-3xl font-bold text-white">$299<span className="text-sm font-medium text-navy-300">/mo</span></div>
            <p className="muted mt-2 text-sm">After the pilot: Capture, Understand, Enhance, Execute and Expand — with approvals and an audit trail on every action.</p>
            <a href="/signup" className="btn-primary mt-4 inline-block">Start with your company →</a>
          </div>
        </div>
        <p className="muted mt-3 text-center text-xs">No setup fee. Cancel any time. Industry packs included.</p>
      </section>

      {/* Public leak-score hook */}
      <div className="mt-10 text-center">
        <a href="/score" className="btn-primary">{t("home.scoreCta")}</a>
      </div>
    </div>
    <PublicFooter />
    </>
  );
}
