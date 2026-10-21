import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { PROVIDERS } from "@/lib/ambassador";
import { updateProfile, updateAiSettings, saveAmbassadorSettings, updateDigestSettings, updateReminderCadence, updateReminderTemplate, updateVocab, savePersona, saveBranding, saveModules } from "./actions";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { MODULES, FIXED_MODULES } from "@/lib/modules";
import WorkspaceStudioForm from "./WorkspaceStudioForm";
import { getVocab, VOCAB_LABELS } from "@/lib/vocab";
import VocabForm from "./VocabForm";
import IndustryPackForm from "./IndustryPackForm";
import TextSizePicker from "@/components/TextSizePicker";
import BuilderFeedbackForm from "./BuilderFeedbackForm";
import AccessibilityToggles from "@/components/AccessibilityToggles";
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
  await guardWorkspaceModule();
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

  const vocab = await getVocab(orgId);
  const overrides = Object.fromEntries(VOCAB_LABELS.map(([key]) => [key, vocab[key] ?? ""]));
  const ws = await getWorkspaceProfile(orgId);

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

      {/* Weekly digest card: on/off, send day, owner WhatsApp destination. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Weekly digest</h2>
        <p className="muted mb-4 text-xs">One email (and WhatsApp, when a number is set) summarizing open leaks, approvals, and money found — sent on the day you pick.</p>
        <form action={updateDigestSettings} className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
            <input type="checkbox" name="digestOn" defaultChecked={profile?.digest_on ?? true} className="h-4 w-4 accent-cue-blue" />
            <div>
              <div className="font-medium text-navy-100">Send the weekly digest</div>
              <div className="muted text-xs">Off means CUE still creates the digest content but does not email it.</div>
            </div>
          </label>
          <div>
            <label className="label" htmlFor="digestDay">Send day</label>
            <select id="digestDay" name="digestDay" defaultValue={String(profile?.digest_day ?? 1)} className="input">
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="whatsappNumber">WhatsApp number for the digest (optional, E.164)</label>
            <input id="whatsappNumber" name="whatsappNumber" defaultValue={profile?.whatsapp_number ?? ""} className="input" placeholder="+15551234567" />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">Save digest settings</button>
          </div>
        </form>
      </section>

      {/* Automated AR reminders: the owner-approved cadence. Off until the
          owner here says so — the daily cron then sends localized payment
          reminders for still-unpaid invoices at the chosen interval. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Automated payment reminders</h2>
        <p className="muted mb-4 text-xs">
          Approve a cadence once and CUE reminds customers with unpaid invoices — at that interval, in each customer's
          own language, WhatsApp first where a number is on file (else email). Pays itself: a customer who pays drops
          off automatically. Nothing sends until you approve here.
        </p>
        <form action={updateReminderCadence} className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
            <input type="checkbox" name="remindersOn" defaultChecked={profile?.reminders_on ?? false} className="h-4 w-4 accent-cue-blue" />
            <div>
              <div className="font-medium text-navy-100">Run the reminder cadence</div>
              <div className="muted text-xs">This approval is what enables the automated daily cron send.</div>
            </div>
          </label>
          <div>
            <label className="label" htmlFor="remindersEveryDays">Cadence</label>
            <select id="remindersEveryDays" name="remindersEveryDays" defaultValue={String(profile?.reminders_every_days ?? 7)} className="input">
              <option value="3">Every 3 days</option>
              <option value="7">Weekly</option>
              <option value="14">Every 2 weeks</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">Save reminder cadence</button>
          </div>
        </form>

        {/* Owner-editable message template: the free-text layer on top of the
            localized drafts. Placeholders fill in each customer's language. */}
        <form action={updateReminderTemplate} className="mt-4">
          <label className="label" htmlFor="reminderTemplate">Message template (optional)</label>
          <textarea
            id="reminderTemplate"
            name="reminderTemplate"
            rows={6}
            maxLength={4000}
            defaultValue={profile?.reminder_template ?? ""}
            className="input"
            placeholder={"Friendly payment nudge placeholders:\n{name} — customer\n{invoices} — their unpaid invoice list\n{total} — amount due\n{days} — days since oldest due date\n{overdue} — the localized overdue sentence"}
          />
          <p className="muted mt-1 text-xs">
            Leave empty to send the built-in drafts. Placeholders fill in each customer's own language — {"{invoices}"} and {"{total}"} are
            always appended if left out, so a reminder never goes out without the amount. Teams that send WhatsApp reminders
            keep this short, one sentence plus the subtotal.
          </p>
          <div className="mt-2">
            <button className="btn-primary">Save template</button>
          </div>
        </form>
      </section>

      {/* Accessibility — text size scales the whole app via the root font. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Text size (accessibility)</h2>
        <p className="muted mb-4 text-xs">
          Makes everything throughout CUE bigger — menus, cards, buttons, and forms. Large is the default.
        </p>
        <TextSizePicker />
      </section>

      {/* Accessibility — display options beyond size, same cookie pattern. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Display accessibility</h2>
        <p className="muted mb-4 text-xs">On/off toggles next to the text-size setting — they apply to the whole app on the next render.</p>
        <AccessibilityToggles />
      </section>

      {/* Industry pack switcher: flips every label pack-wide; per-label
          overrides still layer on top via the card below. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Terminology</h2>
        <p className="muted mb-4 text-xs">Industry pack switches the labels across dashboard, pipeline, and inventory in one move. Custom keeps whatever you set label-by-label below.</p>
        <IndustryPackForm orgId={orgId} />
      </section>

      {/* Workspace Studio — persona, branding, module layout in one place. */}
      <section className="card p-6">
        <h2 className="section-title mb-1">Workspace Studio</h2>
        <p className="muted mb-4 text-xs">
          Make the workspace yours: name your AI Ambassador, brand everything customers see, and show only the modules you actually use.
          Everything carries into quotes, digest emails, the leave-behind pages, and the sidebar.
        </p>
        <WorkspaceStudioForm
          profile={ws}
          modules={MODULES.filter((m) => !FIXED_MODULES.includes(m.key))}
          savePersona={savePersona}
          saveBranding={saveBranding}
          saveModules={saveModules}
          logoUrl={(ws.brandLogoUrl ?? "").includes("/api/workspace/logo/") ? ws.brandLogoUrl : null}
        />
        <div className="mt-4">
          <a href="/onboarding" className="text-xs text-cyan-300 hover:underline">Re-run the guided setup →</a>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">{t("settings.vocabTitle")}</h2>
        <p className="muted mb-4 text-xs">{t("settings.vocabSub")}</p>
        <VocabForm overrides={overrides} />
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

        {/* Message the builder — every role, no ceremony. The owner asked for
            a direct line from any CUE user to feature requests/issues. */}
        <section className="card p-6">
          <h2 className="section-title mb-1">Message the builder</h2>
          <p className="muted mb-3 text-xs">Feature requests and broken things, straight to the person building CUE — no queue, no ticket bot. Every role sees this box.</p>
          <BuilderFeedbackForm userName={session.user.email ?? "you"} />
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
