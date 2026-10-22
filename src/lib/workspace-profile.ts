// Workspace Studio read path — typed workspace_profile with stock defaults
// when the row is absent (lazy-create on save keeps existing orgs untouched).
import { sql } from "./db";
import type { ModuleKey } from "./modules";
import { isModule, FIXED_MODULES } from "./modules";

export type AmbassadorTone = "friendly" | "formal" | "concise" | "enthusiastic";

export type ModuleState = { enabled: boolean; label: string | null };

export type WorkspaceProfile = {
  ambassadorName: string | null;
  ambassadorAvatar: string | null;
  /** Uploaded avatar photo — beats the emoji whenever it is set. */
  ambassadorAvatarUrl: string | null;
  ambassadorTone: AmbassadorTone | null;
  ambassadorGreeting: string | null;
  brandNameOverride: string | null;
  brandLogoUrl: string | null;
  brandAccent: string | null;
  brandContactPhone: string | null;
  brandContactEmail: string | null;
  themeDefault: "system" | "light" | "dark" | null;
  modules: Partial<Record<ModuleKey, ModuleState>>;
  setupCompleted: Partial<Record<"persona" | "branding" | "modules", boolean>>;
};

export const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = {
  ambassadorName: null,
  ambassadorAvatar: null,
  ambassadorAvatarUrl: null,
  ambassadorTone: null,
  ambassadorGreeting: null,
  brandNameOverride: null,
  brandLogoUrl: null,
  brandAccent: null,
  brandContactPhone: null,
  brandContactEmail: null,
  themeDefault: null,
  modules: {},
  setupCompleted: {},
};

const TONES: AmbassadorTone[] = ["friendly", "formal", "concise", "enthusiastic"];

function safeJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  return raw as Record<string, unknown>;
}

function normalizeModules(raw: unknown, orgName: string): Partial<Record<ModuleKey, ModuleState>> {
  const out: Partial<Record<ModuleKey, ModuleState>> = {};
  const obj = safeJson(raw);
  for (const [k, v] of Object.entries(obj)) {
    if (!isModule(k)) continue; // silently drop unknown keys (malformed JSON must not break the sidebar)
    if (FIXED_MODULES.includes(k)) continue;
    const state = safeJson(v);
    out[k] = {
      enabled: state.enabled !== false, // stored value must affirmatively say "false"
      label: typeof state.label === "string" && state.label.trim() ? state.label.trim().slice(0, 40) : null,
    };
  }
  return out;
}

function normalizeSetup(raw: unknown): Partial<Record<"persona" | "branding" | "modules", boolean>> {
  const obj = safeJson(raw);
  return {
    persona: obj.persona === true,
    branding: obj.branding === true,
    modules: obj.modules === true,
  };
}

type Row = {
  ambassador_name: string | null;
  ambassador_avatar: string | null;
  ambassador_avatar_url: string | null;
  ambassador_tone: string | null;
  ambassador_greeting: string | null;
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_accent: string | null;
  brand_contact_phone: string | null;
  brand_contact_email: string | null;
  theme_default: string | null;
  modules: unknown;
  setup_completed: unknown;
};

/** Workspace profile for an org — always resolves (defaults when the row is absent). */
export async function getWorkspaceProfile(orgId: string): Promise<WorkspaceProfile> {
  const rows = await sql`
    select ambassador_name, ambassador_avatar, ambassador_avatar_url, ambassador_tone, ambassador_greeting,
           brand_name, brand_logo_url, brand_accent, brand_contact_phone, brand_contact_email,
           theme_default, modules, setup_completed
    from workspace_profiles where organization_id = ${orgId}`;
  if (!rows.length) return DEFAULT_WORKSPACE_PROFILE;
  const r = rows[0] as Row;
  return {
    ambassadorName: r.ambassador_name?.slice(0, 40) ?? null,
    // 32 = ample room for multi-code-unit glyphs (skin tones, ZWJ sequence
    // family emojis run ~25 UTF-16 units) — trimmed in one place on read.
    // 32 = ample room for multi-code-unit glyphs (skin tones, ZWJ sequence
    // family emojis run ~25 UTF-16 units) — trimmed in one place on read.
    ambassadorAvatar: r.ambassador_avatar?.slice(0, 32) ?? null,
    ambassadorAvatarUrl: r.ambassador_avatar_url?.slice(0, 300) ?? null,
    ambassadorTone: TONES.includes(r.ambassador_tone as AmbassadorTone) ? (r.ambassador_tone as AmbassadorTone) : null,
    ambassadorGreeting: r.ambassador_greeting?.slice(0, 200) ?? null,
    brandNameOverride: r.brand_name?.slice(0, 120) ?? null,
    brandLogoUrl: r.brand_logo_url ?? null,
    brandAccent: r.brand_accent ?? null,
    brandContactPhone: r.brand_contact_phone ?? null,
    brandContactEmail: r.brand_contact_email ?? null,
    themeDefault: r.theme_default === "light" || r.theme_default === "dark" ? r.theme_default : null,
    modules: normalizeModules(r.modules, orgId),
    setupCompleted: normalizeSetup(r.setup_completed),
  };
}

/** Brand display name: profile override, else org name. */
export function brandName(profile: WorkspaceProfile, orgName: string): string {
  return profile.brandNameOverride || orgName;
}

/** Validated accent color — fixed palette or bare #rrggbb; null pass-through. */
export function validAccent(input: string | null | undefined): string | null {
  if (!input) return null;
  const hex = /^#[0-9a-fA-F]{6}$/.exec(input.trim());
  return hex ? input.trim().toLowerCase() : null;
}

export type UpsertInput = {
  ambassador_name?: string | null;
  ambassador_avatar?: string | null;
  ambassador_avatar_url?: string | null;
  ambassador_tone?: string | null;
  ambassador_greeting?: string | null;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_accent?: string | null;
  brand_contact_phone?: string | null;
  brand_contact_email?: string | null;
  theme_default?: string | null;
  modules?: unknown;
  setup_completed?: unknown;
};

/** Lazy upsert — creates the row on first save; existing orgs never get one until they save. */
export async function upsertWorkspaceProfile(orgId: string, patch: UpsertInput): Promise<void> {
  await sql`
    insert into workspace_profiles (organization_id, ambassador_name, ambassador_avatar, ambassador_avatar_url, ambassador_tone,
      ambassador_greeting, brand_name, brand_logo_url, brand_accent, brand_contact_phone, brand_contact_email,
      theme_default, modules, setup_completed)
    values (${orgId}, ${patch.ambassador_name ?? null}, ${patch.ambassador_avatar ?? null},
      ${patch.ambassador_avatar_url ?? null},
      ${patch.ambassador_tone ?? null}, ${patch.ambassador_greeting ?? null}, ${patch.brand_name ?? null},
      ${patch.brand_logo_url ?? null}, ${patch.brand_accent ?? null}, ${patch.brand_contact_phone ?? null},
      ${patch.brand_contact_email ?? null}, ${patch.theme_default ?? null},
      ${sql.json((patch.modules ?? {}) as Record<string, string>)}, ${sql.json((patch.setup_completed ?? {}) as Record<string, string>)})
    on conflict (organization_id) do update set
      ambassador_name = coalesce(excluded.ambassador_name, workspace_profiles.ambassador_name),
      ambassador_avatar = coalesce(excluded.ambassador_avatar, workspace_profiles.ambassador_avatar),
      ambassador_avatar_url = coalesce(excluded.ambassador_avatar_url, workspace_profiles.ambassador_avatar_url),
      ambassador_tone = coalesce(excluded.ambassador_tone, workspace_profiles.ambassador_tone),
      ambassador_greeting = coalesce(excluded.ambassador_greeting, workspace_profiles.ambassador_greeting),
      brand_name = coalesce(excluded.brand_name, workspace_profiles.brand_name),
      brand_logo_url = coalesce(excluded.brand_logo_url, workspace_profiles.brand_logo_url),
      brand_accent = coalesce(excluded.brand_accent, workspace_profiles.brand_accent),
      brand_contact_phone = coalesce(excluded.brand_contact_phone, workspace_profiles.brand_contact_phone),
      brand_contact_email = coalesce(excluded.brand_contact_email, workspace_profiles.brand_contact_email),
      theme_default = coalesce(excluded.theme_default, workspace_profiles.theme_default),
      modules = coalesce(excluded.modules, workspace_profiles.modules),
      setup_completed = coalesce(excluded.setup_completed, workspace_profiles.setup_completed),
      updated_at = now()`;
}
