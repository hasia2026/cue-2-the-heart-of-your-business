"use client";

import { useRef, useState, useTransition } from "react";
import type { WorkspaceProfile } from "@/lib/workspace-profile";
import type { ModuleDef } from "@/lib/modules";
import EmojiPicker from "@/components/EmojiPicker";
import { uploadLogo, removeLogo, uploadAvatar, removeAvatar, previewBranding } from "./actions";

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
  logoUrl,
  orgId,
}: {
  profile: WorkspaceProfile;
  modules: ModuleDef[];
  savePersona: SaveAction;
  saveBranding: SaveAction;
  saveModules: SaveAction;
  logoUrl: string | null;
  orgId: string;
}) {
  const [tab, setTab] = useState<"persona" | "branding" | "modules">("persona");
  const brandingRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Logo upload state ──
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [currentLogo, setCurrentLogo] = useState<string | null>(logoUrl);

  // ── Avatar photo state (photo beats the emoji whenever it is set) ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.ambassadorAvatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setAvatarMsg(null);
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const res = await uploadAvatar(fd);
      if (res.ok) {
        setAvatarUrl(`/api/workspace/avatar/${orgId}`);
        setAvatarMsg("Photo uploaded ✓ — the bubble now shows it everywhere.");
      } else {
        setAvatarMsg(res.error ?? "Upload failed.");
      }
    } catch {
      setAvatarMsg("Upload failed — try again.");
    } finally {
      setAvatarBusy(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true);
    setAvatarMsg(null);
    try {
      await removeAvatar();
      setAvatarUrl(null);
      setAvatarMsg("Photo removed — back to the emoji.");
    } catch {
      setAvatarMsg("Removal failed — try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setLogoMsg(null);
    const fd = new FormData();
    fd.append("logo", file);
    try {
      const res = await uploadLogo(fd);
      if (res.ok) {
        setCurrentLogo(`/api/workspace/logo/${currentOrgToken()}`);
        setLogoMsg("Uploaded ✓ — check it in the preview below");
        // Reload the branding form so the saved URL is in the inputs.
        brandingRef.current?.reset();
      } else {
        setLogoMsg(res.error ?? "Upload failed.");
      }
    } catch {
      setLogoMsg("Upload failed — try again.");
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // The public logo URL is deterministic per org; we derive it from the
  // profile's logo path when uploaded (it embeds the org id), else null.
  function currentOrgToken(): string {
    const m = currentLogo?.match(/\/api\/workspace\/logo\/([0-9a-f-]{36})/i);
    return m ? m[1] : "";
  }

  async function onRemoveLogo() {
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      await removeLogo();
      setCurrentLogo(null);
      setLogoMsg("Logo removed.");
    } catch {
      setLogoMsg("Removal failed — try again.");
    } finally {
      setLogoBusy(false);
    }
  }

  // ── Live preview state ──
  const [preview, setPreview] = useState<{ quote: string; digest: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<"quote" | "digest">("quote");
  const [pending, startTransition] = useTransition();

  function runPreview(saved: boolean) {
    const f = brandingRef.current;
    const fd = f ? new FormData(f) : new FormData();
    startTransition(async () => {
      const res = await previewBranding({
        brandName: fd.get("brandName") as string,
        brandAccent: fd.get("brandAccent") as string,
        brandAccentCustom: fd.get("brandAccentCustom") as string,
        contactPhone: fd.get("brandContactPhone") as string,
        contactEmail: fd.get("brandContactEmail") as string,
        useUnsaved: saved ? null : "1",
      });
      if (res.ok && res.quote && res.digest) {
        setPreview({ quote: res.quote, digest: res.digest });
        setTab("branding");
      }
    });
  }

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
          <div className="md:col-span-2">
            <span className="label">Avatar — pick any emoji, or upload a photo</span>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[220px] flex-1">
                <EmojiPicker name="ambassadorAvatar" defaultValue={profile.ambassadorAvatar ?? ""} label="Avatar emoji" />
              </div>
              <div className="min-w-[240px] flex-1">
                <div className="flex items-center gap-2">
                  {avatarUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarUrl} alt="Current ambassador photo" className="h-10 w-10 rounded-full object-cover ring-1 ring-white/20" />
                      <button type="button" onClick={onRemoveAvatar} disabled={avatarBusy} className="btn-ghost !px-2 !py-1 text-xs">Remove photo</button>
                    </>
                  ) : (
                    <span className="muted text-xs">No photo yet — the emoji above is shown.</span>
                  )}
                </div>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onAvatarChange}
                  disabled={avatarBusy}
                  className="input mt-2 !py-1.5 text-xs"
                  aria-label="Upload an avatar photo (PNG, JPEG or WebP, up to 200 KB)"
                />
                {avatarMsg && <p className="muted mt-1 text-xs" role="status">{avatarMsg}</p>}
              </div>
            </div>
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
        <div className="space-y-4">
          <form ref={brandingRef} action={saveBranding} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="wsBrandName">Business name as customers see it</label>
              <input id="wsBrandName" name="brandName" defaultValue={profile.brandNameOverride ?? ""} className="input" placeholder="(uses your organization name)" maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="wsLogo">Logo — upload (PNG, JPEG, WebP, SVG; ≤200 KB)</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={onLogoChange}
                  disabled={logoBusy}
                  className="input !py-1.5 text-xs"
                  aria-label="Upload a logo file"
                />
                {currentLogo && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={currentLogo} alt="Current logo" className="h-8 w-auto rounded bg-white/[0.06] px-1" />
                    <button type="button" onClick={onRemoveLogo} disabled={logoBusy} className="btn-ghost !px-2 !py-1 text-xs">Remove</button>
                  </>
                )}
              </div>
              {logoMsg && <p className="muted mt-1 text-xs" role="status">{logoMsg}</p>}
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
            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <button className="btn-primary">Save branding</button>
              <button type="button" onClick={() => runPreview(true)} disabled={pending} className="btn-ghost text-xs">
                {pending ? "Rendering…" : "Preview saved branding"}
              </button>
              <button type="button" onClick={() => runPreview(false)} disabled={pending} className="btn-ghost text-xs">
                {pending ? "Rendering…" : "Preview these unsaved edits"}
              </button>
            </div>
          </form>

          {preview && (
            <div className="rounded-xl border border-white/[0.08] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="eyebrow">Live preview — real quote & digest builders, sample data, nothing sent</span>
                <div className="ms-auto flex gap-1.5">
                  {(["quote", "digest"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreviewTab(t)}
                      className={`rounded-full px-3 py-1 text-xs ${previewTab === t ? "bg-cyan-500/20 text-cyan-200" : "text-navy-300"}`}
                    >
                      {t === "quote" ? "Quote email" : "Weekly digest"}
                    </button>
                  ))}
                </div>
              </div>
              <iframe
                title="Branding preview"
                srcDoc={preview[previewTab]}
                sandbox=""
                className="h-[420px] w-full rounded-lg border border-white/[0.06] bg-ink-950"
              />
            </div>
          )}
        </div>
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
