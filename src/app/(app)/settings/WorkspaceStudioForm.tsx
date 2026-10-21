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

export default function WorkspaceStudioForm({
  profile,
  modules,
  savePersona,
  saveBranding,
  saveModules,
}: {
  profile: WorkspaceProfile;
  modules: ModuleDef[];
  savePersona: SaveAction;
  saveBranding: SaveAction;
  saveModules: SaveAction;
}) {
  const [tab, setTab] = useState<"persona" | "branding" | "modules">("persona");
  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
        tab === id ? "bg-violet-500/20 text-violet-200" : "text-navy-300 hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {tabBtn("persona", "① Ambassador persona")}
        {tabBtn("branding", "② Branding")}
        {tabBtn("modules", "③ Modules")}
      </div>

      {tab === "persona" && (
        <form action={savePersona} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="wsAmbName">Ambassador name</label>
            <input id="wsAmbName" name="ambassadorName" defaultValue={profile.ambassadorName ?? ""} className="input" placeholder="Revi" maxLength={40} />
          </div>
          <div>
            <label className="label" htmlFor="wsAvatar">Avatar emoji</label>
            <input id="wsAvatar" name="ambassadorAvatar" defaultValue={profile.ambassadorAvatar ?? ""} className="input" placeholder="🦋" maxLength={8} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="wsGreeting">Greeting (first thing it says when opened)</label>
            <input id="wsGreeting" name="ambassadorGreeting" defaultValue={profile.ambassadorGreeting ?? ""} className="input" placeholder="Hi! I watch the numbers so you can run the floor." maxLength={200} />
          </div>
          <div>
            <label className="label" htmlFor="wsTone">Voice tone</label>
            <select id="wsTone" name="tone" defaultValue={profile.ambassadorTone ?? ""} className="input">
              {TONES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">Save persona</button>
          </div>
        </form>
      )}

      {tab === "branding" && (
        <form action={saveBranding} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="wsBrandName">Business name as customers see it</label>
            <input id="wsBrandName" name="brandName" defaultValue={profile.brandNameOverride ?? ""} className="input" placeholder="(uses your organization name)" maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="wsLogo">Logo URL (https)</label>
            <input id="wsLogo" name="brandLogoUrl" defaultValue={profile.brandLogoUrl ?? ""} className="input" placeholder="https://…/logo.png" />
          </div>
          <div>
            <label className="label">Accent color</label>
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
            <label className="label" htmlFor="wsTheme">Theme default</label>
            <select id="wsTheme" name="themeDefault" defaultValue={profile.themeDefault ?? "system"} className="input">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="wsPhone">Contact phone (quotes & emails)</label>
            <input id="wsPhone" name="brandContactPhone" defaultValue={profile.brandContactPhone ?? ""} className="input" placeholder="+1 555 123 4567" />
          </div>
          <div>
            <label className="label" htmlFor="wsEmail">Contact email (quotes & emails)</label>
            <input id="wsEmail" name="brandContactEmail" defaultValue={profile.brandContactEmail ?? ""} className="input" placeholder="sales@yourbusiness.com" />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">Save branding</button>
          </div>
        </form>
      )}

      {tab === "modules" && (
        <form action={saveModules}>
          <p className="muted mb-3 text-xs">Hide what you don't use and rename what you do. Dashboard and Settings always stay.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {modules.map((m) => {
              const state = profile.modules[m.key];
              return (
                <div key={m.key} className="flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2">
                  <input type="checkbox" name={`mod_${m.key}_on`} defaultChecked={state?.enabled !== false} className="h-4 w-4 accent-violet-500" />
                  <input
                    name={`mod_${m.key}_label`}
                    defaultValue={state?.label ?? ""}
                    placeholder={m.defaultLabel}
                    maxLength={40}
                    className="input flex-1 !py-1 text-sm"
                    aria-label={`${m.defaultLabel} label`}
                  />
                  <span className="muted hidden text-[11px] sm:block">{m.href}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <button className="btn-primary">Save module layout</button>
          </div>
        </form>
      )}
    </div>
  );
}
