import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PROVIDERS } from "@/lib/ambassador";
import { updateProfile, updateAiSettings, saveAmbassadorSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
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

  const AI_LEVELS = [
    ["observe", "Observe", "CUE can analyze information."],
    ["recommend", "Recommend", "CUE can suggest actions with evidence."],
    ["prepare", "Prepare", "CUE can draft workflows for approval."],
    ["execute", "Execute", "CUE can run approved actions."],
    ["automate", "Automate", "CUE can run predefined rules without asking."],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Business configuration, AI controls, team, and the audit trail.</p>
      </div>

      <section className="card p-6">
        <h2 className="section-title mb-4">Business profile</h2>
        <form action={updateProfile} className="grid gap-4 md:grid-cols-2">
          {[
            ["industry", "Industry", profile?.industry?.replace("_", " ") ?? ""],
            ["size", "Size", profile?.size ?? ""],
            ["locations", "Locations", profile?.locations ?? ""],
            ["businessModel", "Business model", profile?.business_model ?? ""],
          ].map(([name, label, val]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input id={name} name={name} defaultValue={val} className="input" />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label" htmlFor="offerings">Offerings (one per line)</label>
            <textarea id="offerings" name="offerings" rows={3} defaultValue={profile?.offerings ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="mission">Mission</label>
            <textarea id="mission" name="mission" rows={2} defaultValue={profile?.mission ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="targetCustomers">Target customers</label>
            <input id="targetCustomers" name="targetCustomers" defaultValue={profile?.target_customers ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="values">Values</label>
            <input id="values" name="values" defaultValue={profile?.values_text ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">Save profile</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">AI permissions</h2>
        <p className="muted mb-4 text-xs">Consequential actions are never automatic by default. You decide how far CUE can go.</p>
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
          <button className="btn-primary">Save AI controls</button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">AI Ambassador</h2>
        <p className="muted mb-4 text-xs">
          The 24/7 chat rep in the bottom-right corner of every page. Bring your own key —
          CUE&apos;s grounded data core always computes the facts first; your LLM is only the voice.
          Free tiers: Groq, Google Gemini, and OpenRouter&apos;s free models.
        </p>
        <form action={saveAmbassadorSettings} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="provider">Provider</label>
            <select id="provider" name="provider" defaultValue={(ai?.ambassador_provider as string) ?? ""} className="input">
              <option value="">Grounded data only (no LLM)</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label} — {p.freeTier}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ambModel">Model (optional)</label>
            <input id="ambModel" name="model" defaultValue={(ai?.ambassador_model as string) ?? ""} className="input" placeholder="provider default" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="apiKey">
              API key {ai?.ambassador_key_enc ? "(saved — enter a new one to replace)" : ""}
            </label>
            <input id="apiKey" name="apiKey" type="password" className="input" placeholder="encrypted at rest" autoComplete="off" />
          </div>
          <label className="flex items-center gap-2 text-xs text-navy-300">
            <input type="checkbox" name="remove" className="h-4 w-4 accent-cue-blue" />
            Disconnect Ambassador
          </label>
          <div className="md:col-span-2">
            <button className="btn-primary">Save Ambassador</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="section-title mb-1">Subscription</h2>
        <p className="muted mb-4 text-xs">
          Operator — $299/mo after your pilot. Referred by a partner? Their share is split
          automatically by Stripe at checkout.
        </p>
        {billing === "success" && (
          <p className="mb-3 text-xs text-emerald-300">You&apos;re subscribed — welcome to Operator.</p>
        )}
        {billing === "cancelled" && (
          <p className="mb-3 text-xs text-amber-300">Checkout cancelled — no charge was made.</p>
        )}
        {billing === "not_configured" && (
          <p className="mb-3 text-xs text-amber-300">
            Billing isn&apos;t configured on this deployment yet (needs STRIPE_SECRET_KEY and STRIPE_PRICE_ID).
          </p>
        )}
        <a className="btn-primary" href="/api/billing/checkout">Subscribe with Stripe →</a>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title mb-3">Team</h2>
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
          <h2 className="section-title mb-3">Audit trail (latest)</h2>
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
