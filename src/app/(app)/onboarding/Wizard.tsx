"use client";

import { useState } from "react";
import type { WorkspaceProfile } from "@/lib/workspace-profile";
import type { ModuleDef } from "@/lib/modules";

type SaveAction = (formData: FormData) => Promise<void>;

const ACCENTS = [
  "#7c6cff", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#f472b6",
  "#a78bfa", "#22d3ee", "#4ade80", "#fb923c", "#e879f9", "#94a3b8",
];

const TONES = [
  { v: "", label: "Default (friendly)" },
  { v: "friendly", label: "Friendly" },
  { v: "formal", label: "Formal" },
  { v: "concise", label: "Concise" },
  { v: "enthusiastic", label: "Enthusiastic" },
];

const STEPS = ["persona", "branding", "modules"] as const;

export default function OnboardingWizard({
  orgName,
  profile,
  modules,
  canEdit,
  actions,
}: {
  orgName: string;
  profile: WorkspaceProfile;
  modules: ModuleDef[];
  canEdit: boolean;
  actions: { savePersona: SaveAction; saveBranding: SaveAction; saveModules: SaveAction };
}) {
  const [step, setStep] = useState<(typeof STEPS)[number]>("persona");
  const done = profile.setupCompleted;

  const stepHead = (id: (typeof STEPS)[number], n: number, title: string) => (
    <div key={id} className="flex shrink-0 items-center gap-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === id ? "bg-violet-500 text-white" : done[id] ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.08] text-navy-300"}`}>
        {done[id] && step !== id ? "✓" : n}
      </span>
      <button type="button" onClick={() => setStep(id)} className={`text-sm ${step === id ? "font-semibold text-white" : "text-navy-300"}`}>
        {title}
      </button>
    </div>
  );

  const disabled = !canEdit;
  const note = disabled ? <p className="muted mb-2 text-xs">Only owners, admins and managers can edit the workspace.</p> : null;

  return (
    <div className="card p-6">
      <div className="mb-5 flex flex-wrap gap-4">
        {stepHead("persona", 1, "Your AI Ambassador")}
        {stepHead("branding", 2, "Your branding")}
        {stepHead("modules", 3, "Your modules")}
      </div>

      {disabled ? note : step === "persona" ? (
        <form action={actions.savePersona} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="obName">Name your AI Ambassador</label>
            <input id="obName" name="ambassadorName" defaultValue={profile.ambassadorName ?? ""} className="input" placeholder="Revi" maxLength={40} />
            <p className="muted mt-1 text-xs">It answers questions in the chat bubble on every page.</p>
          </div>
          <div>
            <label className="label" htmlFor="obAvatar">Pick its avatar (any emoji)</label>
            <input id="obAvatar" name="ambassadorAvatar" defaultValue={profile.ambassadorAvatar ?? ""} className="input" placeholder="🦋" maxLength={8} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="obGreeting">What it says when opened</label>
            <input id="obGreeting" name="ambassadorGreeting" defaultValue={profile.ambassadorGreeting ?? ""} className="input" placeholder="Hi! I watch the numbers so you can run the floor." maxLength={200} />
          </div>
          <div>
            <label className="label" htmlFor="obTone">How it talks</label>
            <select id="obTone" name="tone" defaultValue={profile.ambassadorTone ?? ""} className="input">
              {TONES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button className="btn-primary">Save & continue</button>
            <button type="button" onClick={() => setStep("branding")} className="btn-ghost text-xs">Skip for now</button>
          </div>
        </form>
      ) : step === "branding" ? (
        <form action={actions.saveBranding} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="obBrandName">Business name ({orgName})</label>
            <input id="obBrandName" name="brandName" defaultValue={profile.brandNameOverride ?? ""} className="input" placeholder={orgName || "(uses your organization name)"} maxLength={120} />
            <p className="muted mt-1 text-xs">Shown on quotes, digest emails and the leave-behind page.</p>
          </div>
          <div>
            <label className="label" htmlFor="obLogo">Logo URL (https)</label>
            <input id="obLogo" name="brandLogoUrl" defaultValue={profile.brandLogoUrl ?? ""} className="input" placeholder="https://…/logo.png" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Accent color — used on quotes and emails</label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((c) => (
                <label key={c} className="cursor-pointer" title={c}>
                  <input type="radio" name="brandAccent" value={c} defaultChecked={(profile.brandAccent ?? "#7c6cff") === c} className="sr-only peer" />
                  <span className="block h-7 w-7 rounded-full ring-2 ring-transparent peer-checked:ring-white/70" style={{ background: c }} />
                </label>
              ))}
              <span className="muted text-xs">or custom hex:</span>
              <input name="brandAccentCustom" defaultValue={profile.brandAccent ?? ""} className="input !w-28 !py-1.5" placeholder="#7c6cff" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="obPhone">Contact phone (footer of quotes/emails)</label>
            <input id="obPhone" name="brandContactPhone" defaultValue={profile.brandContactPhone ?? ""} className="input" placeholder="+1 555 123 4567" />
          </div>
          <div>
            <label className="label" htmlFor="obEmail">Contact email (footer of quotes/emails)</label>
            <input id="obEmail" name="brandContactEmail" defaultValue={profile.brandContactEmail ?? ""} className="input" placeholder="sales@yourbusiness.com" />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button className="btn-primary">Save & continue</button>
            <button type="button" onClick={() => setStep("modules")} className="btn-ghost text-xs">Skip for now</button>
            <button type="button" onClick={() => setStep("persona")} className="btn-ghost text-xs">← Back</button>
          </div>
        </form>
      ) : (
        <form action={actions.saveModules}>
          <p className="muted mb-3 text-sm">Turn off what you don't use, rename what you do. Dashboard and Settings always stay.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {modules.map((m) => {
              const state = profile.modules[m.key];
              return (
                <div key={m.key} className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2">
                  <input type="checkbox" name={`mod_${m.key}_on`} defaultChecked={state?.enabled !== false} className="h-4 w-4 accent-violet-500" />
                  <input name={`mod_${m.key}_label`} defaultValue={state?.label ?? ""} placeholder={m.defaultLabel} maxLength={40} className="input flex-1 !py-1 text-sm" aria-label={`${m.defaultLabel} label`} />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary">Finish setup</button>
            <a href="/dashboard" className="btn-ghost text-xs">Take me to the dashboard</a>
          </div>
        </form>
      )}
    </div>
  );
}
