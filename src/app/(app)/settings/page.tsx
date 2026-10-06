import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ambassador";
import { updateProfile, updateAiSettings, saveAmbassadorSettings } from "./actions";
import { getT } from "@/lib/locale";
import type { DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const { t } = await getT();
  const session = await requireSession();
  const orgId = session.organizationId;
  const [profile] = await sql`select * from business_profiles where organization_id = ${orgId}`;
  const [ai] = await sql`select * from ai_settings where organization_id = ${orgId}`;
  const team = await sql`
    select u.name, u.email, m.role from members m join users u on u.id = m.user_id
    where m.organization_id = ${orgId} order by m.created_at`;
  const audit = await sql`
    select action, actor_type, detail, created_at from audit_events
    where organization_id = ${orgId} order by created_at desc limit 25`;

  const AI_LEVELS: [string, string, string][] = [
    ["observe", t("settings.aiObserve"), t("settings.aiObserveDesc")],
    ["recommend", t("settings.aiRecommend"), t("settings.aiRecommendDesc")],
    ["prepare", t("settings.aiPrepare"), t("settings.aiPrepareDesc")],
    ["execute", t("settings.aiRun"), t("settings.aiRunDesc")],
    ["automate", t("settings.aiAutomate"), t("settings.aiAutomateDesc")],
  ];
  const tierKey = (s: string): DictKey =>
    s === "Free tier available" ? "settings.freeTier" : s === "Pay-as-you-go" ? "settings.payGo" : "settings.freeModels";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t("settings.title")}</h1>
        <p className="page-sub">{t("settings.subtitle")}</p>
      </div>

      <section className="card p-6">
        <h2 className="section-title mb-4">{t("settings.profile")}</h2>
        <form action={updateProfile} className="grid gap-4 md:grid-cols-2">
          {[
            ["industry", t("settings.industry"), profile?.industry?.replace("_", " ") ?? ""],
            ["size", t("settings.size"), profile?.size ?? ""],
            ["locations", t("settings.locations"), profile?.locations ?? ""],
            ["businessModel", t("settings.businessModel"), profile?.business_model ?? ""],
          ].map(([name, label, val]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input id={name} name={name} defaultValue={val} className="input" />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label" htmlFor="offerings">{t("settings.offerings")}</label>
            <textarea id="offerings" name="offerings" rows={3} defaultValue={profile?.offerings ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="mission">{t("settings.mission")}</label>
            <textarea id="mission" name="mission" rows={2} defaultValue={profile?.mission ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="targetCustomers">{t("settings.targetCustomers")}</label>
            <input id="targetCustomers" name="targetCustomers" defaultValue={profile?.target_customers ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="values">{t("settings.values")}</label>
            <input id="values" name="values" defaultValue={profile?.values_text ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">{t("settings.saveProfile")}</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">{t("settings.aiPerms")}</h2>
        <p className="muted mb-4 text-xs">{t("settings.aiPermsSub")}</p>
        <form action={updateAiSettings} className="space-y-3">
          {AI_LEVELS.map(([key, title, desc]) => (
            <label key={key} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
              <input type="checkbox" name={key} defaultChecked={ai ? Boolean(ai[key]) : key === "observe" || key === "recommend" || key === "prepare"} className="h-4 w-4 accent-cue-blue" />
              <div>
                <div className="font-medium text-navy-100">{title}</div>
                <div className="text-xs text-navy-300">{desc}</div>
              </div>
            </label>
          ))}
          <button className="btn-primary">{t("settings.saveAi")}</button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">{t("settings.ambassador")}</h2>
        <p className="muted mb-4 text-xs">{t("settings.ambassadorSub")}</p>
        <form action={saveAmbassadorSettings} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="provider">{t("settings.provider")}</label>
            <select id="provider" name="provider" defaultValue={(ai?.ambassador_provider as string) ?? ""} className="input">
              <option value="">{t("settings.providerNone")}</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label} — {t(tierKey(p.freeTier))}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ambModel">{t("settings.model")}</label>
            <input id="ambModel" name="model" defaultValue={(ai?.ambassador_model as string) ?? ""} className="input" placeholder={t("settings.modelPlaceholder")} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="apiKey">
              {t("settings.apiKey")} {ai?.ambassador_key_enc ? t("settings.apiKeySaved") : ""}
            </label>
            <input id="apiKey" name="apiKey" type="password" className="input" placeholder={t("settings.apiKeyPlaceholder")} autoComplete="off" />
          </div>
          <label className="flex items-center gap-2 text-xs text-navy-300">
            <input type="checkbox" name="remove" className="h-4 w-4 accent-cue-blue" />
            {t("settings.disconnect")}
          </label>
          <div className="md:col-span-2">
            <button className="btn-primary">{t("settings.saveAmbassador")}</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">{t("settings.subscription")}</h2>
        <p className="muted mb-4 text-xs">{t("settings.subscriptionSub")}</p>
        {billing === "success" && (
          <p className="mb-3 text-xs text-emerald-300">{t("settings.billingSuccess")}</p>
        )}
        {billing === "cancelled" && (
          <p className="mb-3 text-xs text-amber-300">{t("settings.billingCancelled")}</p>
        )}
        {billing === "not_configured" && (
          <p className="mb-3 text-xs text-amber-300">{t("settings.billingNotConfigured")}</p>
        )}
        <a className="btn-primary" href="/api/billing/checkout">{t("settings.subscribe")} →</a>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-3">{t("settings.team")}</h2>
          <ul className="space-y-2">
            {team.map((m, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="font-medium text-navy-100">{m.name}</span>
                <span className="text-navy-300">{m.email}</span>
                <span className="badge-low ms-auto">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="section-title mb-3">{t("settings.audit")}</h2>
          <ul className="space-y-1.5 text-xs">
            {audit.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-navy-300/60">{new Date(a.created_at).toLocaleString()}</span>
                <span className="text-navy-100">{a.action}</span>
                {a.detail && <span className="truncate text-navy-300">— {a.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
