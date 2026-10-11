import PublicHeader from "@/components/PublicHeader";
import { getT } from "@/lib/locale";
import { LogoMark } from "@/components/NavClient";
import type { DictKey } from "@/lib/i18n";

export const metadata = { title: "CUE vs your CRM & FSM tools" };

// Positioning rows: the prospect's tool stores/operates; CUE audits and closes
// the loop. Mirrors OUTREACH-SCRIPTS §E — never trash the incumbent.
const ROWS: { cap: DictKey; crm: string; cue: string }[] = [
  { cap: "cmp.stores", crm: "✓", cue: "✓" },
  { cap: "cmp.finds", crm: "✗", cue: "✓" },
  { cap: "cmp.evidence", crm: "✗", cue: "✓" },
  { cap: "cmp.approve", crm: "—", cue: "✓" },
  { cap: "cmp.replaces", crm: "✗", cue: "✗" },
];

export default async function ComparePage() {
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="text-center">
        <div className="cue-halo mx-auto mb-6 inline-flex"><LogoMark className="h-14 w-14" /></div>
        <h1 className="text-3xl font-bold text-white md:text-5xl">{t("cmp.title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-navy-300">{t("cmp.sub")}</p>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-left">
              <th className="px-5 py-3 font-medium text-navy-300">{t("cmp.capCol")}</th>
              <th className="px-5 py-3 font-medium text-navy-300">{t("cmp.crmCol")}</th>
              <th className="px-5 py-3 font-semibold text-cue-blue">{t("cmp.cueCol")}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.cap} className="border-t border-white/[0.06]">
                <td className="px-5 py-3 text-navy-100">{t(r.cap)}</td>
                <td className="px-5 py-3 text-navy-300">{r.crm}</td>
                <td className="px-5 py-3 font-medium text-white">{r.cue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {(["cmp.crmNote", "cmp.fsmNote", "cmp.cueNote"] as DictKey[]).map((k) => (
          <div key={k} className="card p-5">
            <p className="text-xs text-navy-300">{t(k)}</p>
          </div>
        ))}
      </div>

      <div className="card mt-10 p-6 text-center">
        <p className="text-sm text-navy-100">{t("cmp.pledge")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a href="/score" className="btn-primary">{t("cmp.ctaScore")}</a>
          <a href="/book" className="btn-ghost">{t("cmp.ctaBook")}</a>
        </div>
      </div>
    </div>
    </>
  );
}
