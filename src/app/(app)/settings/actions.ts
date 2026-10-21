"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/secretbox";
import { PROVIDERS } from "@/lib/ambassador";
import { VOCAB_LABELS, INDUSTRY_PACKS } from "@/lib/vocab";
import {
  getWorkspaceProfile, upsertWorkspaceProfile, validAccent,
  type AmbassadorTone,
} from "@/lib/workspace-profile";
import { MODULES, FIXED_MODULES, isModule, type ModuleKey } from "@/lib/modules";

export async function updateProfile(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const g = (k: string) => String(formData.get(k) ?? "").trim() || null;

  await sql`
    update business_profiles set
      industry = ${g("industry")}, size = ${g("size")}, locations = ${g("locations")},
      business_model = ${g("businessModel")}, offerings = ${g("offerings")},
      target_customers = ${g("targetCustomers")}, mission = ${g("mission")},
      values_text = ${g("values")}, operational_priorities = ${g("priorities")}
    where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "PROFILE_UPDATED", detail: "Business profile edited",
  });
  revalidatePath("/settings");
  revalidatePath("/compass");
}

export async function updateIndustryPack(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const raw = String(formData.get("industryPack") ?? "").trim();
  const pack = INDUSTRY_PACKS.find((p) => p.value === raw);
  if (!pack) return; // unknown value — action no-ops rather than writing junk

  await sql`update business_profiles set industry = ${raw} where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "INDUSTRY_PACK_SWITCHED", detail: `Industry pack = ${pack.label}`,
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/compass");
}

export async function updateDigestSettings(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const on = String(formData.get("digestOn") ?? "") === "on";
  const rawDay = Number(String(formData.get("digestDay") ?? ""));
  const day = Number.isInteger(rawDay) && rawDay >= 0 && rawDay <= 6 ? rawDay : 1;
  // Owner WhatsApp destination for digests — empty clears it (honest degrade
  // on the cron route when WHATSAPP is not actually configured).
  const waRaw = String(formData.get("whatsappNumber") ?? "").trim();
  const wa = /^[+]?[0-9]{7,15}$/.test(waRaw) ? waRaw.replace("+", "") : null;

  await sql`
    update business_profiles set
      digest_on = ${on}, digest_day = ${day}, whatsapp_number = ${wa}
    where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "DIGEST_SETTINGS_UPDATED",
    detail: on ? `weekly digest on (day ${day})` : "weekly digest off",
  });
  revalidatePath("/settings");
}

/** Owner approval of the automated AR reminder cadence. reminders_on is
 *  OFF by default — checking it here is the approval that arms the daily
 *  cron (GET /api/reminders). The interval is clamped to the shipped options
 *  so a hand-form can't arm hourly spam. */
export async function updateReminderCadence(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can set the reminder cadence.");
  const on = String(formData.get("remindersOn") ?? "") === "on";
  const rawEvery = Number(String(formData.get("remindersEveryDays") ?? ""));
  const every = [3, 7, 14].includes(rawEvery) ? rawEvery : 7;

  await sql`
    update business_profiles set
      reminders_on = ${on}, reminders_every_days = ${every}
    where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "REMINDER_CADENCE_UPDATED",
    detail: on ? `automated payment reminder cadence approved (every ${every} day(s))` : "automated payment reminders off",
  });
  revalidatePath("/settings");
}

/** Owner-editable message template for payment reminders. Placeholders
 *  ({name} {days} {overdue} {invoices} {total}) get filled in each customer's
 *  language; blank clears back to the built-in localized drafts. */
export async function updateReminderTemplate(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  if (session.role === "MEMBER") throw new Error("Only owners, admins and managers can edit the reminder template.");
  const raw = String(formData.get("reminderTemplate") ?? "").slice(0, 4000).trim();
  const template = raw || null;

  await sql`update business_profiles set reminder_template = ${template} where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "REMINDER_TEMPLATE_UPDATED",
    detail: template ? "custom reminder template saved" : "reminder template cleared — built-in drafts in use",
  });
  revalidatePath("/settings");
  revalidatePath("/pipeline");
}

export async function updateVocab(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  // Only known keys, only non-empty strings; blank clears the override so the
  // industry pack default shows again. dimPipeline/dimInventory may be null.
  const overrides: Record<string, string | null> = {};
  for (const [key] of VOCAB_LABELS) {
    const v = String(formData.get(key) ?? "").trim();
    if (v) overrides[key] = v;
  }

  // sql.json() — NOT a stringified + ::jsonb cast, which postgres.js stores as a
  // JSON *string* scalar (getVocab would silently fall back to pack defaults).
  await sql`update business_profiles set label_overrides = ${sql.json(overrides)} where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "VOCAB_UPDATED", detail: `Vocabulary overrides set (${Object.keys(overrides).length} labels)`,
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/compass");
  revalidatePath("/pipeline");
}

export async function updateAiSettings(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const bool = (k: string) => formData.get(k) === "on";

  await sql`
    update ai_settings set
      observe = ${bool("observe")}, recommend = ${bool("recommend")}, prepare = ${bool("prepare")},
      execute = ${bool("execute")}, automate = ${bool("automate")}
    where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "AI_SETTINGS_UPDATED", detail: "AI permission levels changed",
    metadata: {
      observe: bool("observe"), recommend: bool("recommend"), prepare: bool("prepare"),
      execute: bool("execute"), automate: bool("automate"),
    },
  });
  revalidatePath("/settings");
}

export async function saveAmbassadorSettings(formData: FormData) {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const providerRaw = String(formData.get("provider") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim() || null;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const remove = formData.get("remove") === "on";

  if (remove) {
    await sql`update ai_settings set ambassador_provider = null, ambassador_model = null, ambassador_key_enc = null where organization_id = ${orgId}`;
    await logAudit({ organizationId: orgId, actorId: session.user.id, action: "AMBASSADOR_REMOVED", detail: "AI Ambassador disconnected" });
    revalidatePath("/settings");
    return;
  }

  const provider = PROVIDERS.find((p) => p.id === providerRaw)?.id ?? null;
  await sql`
    update ai_settings set
      ambassador_provider = ${provider},
      ambassador_model = ${model},
      ambassador_key_enc = ${apiKey ? encryptSecret(apiKey) : null}
    where organization_id = ${orgId}`;

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "AMBASSADOR_UPDATED",
    detail: provider ? `AI Ambassador set to ${provider}` : "AI Ambassador provider cleared",
  });
  revalidatePath("/settings");
}

// ───────── Workspace Studio ─────────
// Owner-curated workspace: Ambassador persona, branding, module toggles/labels.
// Writes go to one lazy-created workspace_profiles row per org.

const TONES: AmbassadorTone[] = ["friendly", "formal", "concise", "enthusiastic"];

async function requireStudioWriter() {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    throw new Error("Only owners, admins and managers can customize the workspace.");
  }
  return session;
}

function cleanText(raw: FormDataEntryValue | null, max: number): string | null {
  const v = String(raw ?? "").trim();
  return v ? v.slice(0, max) : null;
}

function httpsLogo(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return v.slice(0, 500);
  } catch {
    return null;
  }
}

function markSetup(current: Record<string, unknown>, step: string): Record<string, string> {
  return { ...current, [step]: true } as Record<string, string>;
}

async function currentSetup(orgId: string): Promise<Record<string, unknown>> {
  const p = await getWorkspaceProfile(orgId);
  return { ...p.setupCompleted } as Record<string, unknown>;
}

/** Ambassador persona step — name, avatar emoji, greeting, tone. */
export async function savePersona(formData: FormData) {
  const session = await requireStudioWriter();
  const orgId = session.organizationId;
  const toneRaw = String(formData.get("tone") ?? "").trim();
  await upsertWorkspaceProfile(orgId, {
    ambassador_name: cleanText(formData.get("ambassadorName"), 40),
    ambassador_avatar: cleanText(formData.get("ambassadorAvatar"), 8),
    ambassador_tone: TONES.includes(toneRaw as AmbassadorTone) ? toneRaw : null,
    ambassador_greeting: cleanText(formData.get("ambassadorGreeting"), 200),
  });
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "WORKSPACE_PERSONA_UPDATED", detail: "Ambassador persona customized",
  });
  await sql`update workspace_profiles set setup_completed = ${sql.json(markSetup(await currentSetup(orgId), "persona"))} where organization_id = ${orgId}`;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
}

/** Branding step — display name, logo, accent, contacts, theme default. */
export async function saveBranding(formData: FormData) {
  const session = await requireStudioWriter();
  const orgId = session.organizationId;
  const themeRaw = String(formData.get("themeDefault") ?? "").trim();
  // Custom hex wins when it validates; else the palette radio; else null (stock violet).
  const customAccent = validAccent(String(formData.get("brandAccentCustom") ?? ""));
  await upsertWorkspaceProfile(orgId, {
    brand_name: cleanText(formData.get("brandName"), 120),
    brand_logo_url: httpsLogo(formData.get("brandLogoUrl")),
    brand_accent: customAccent ?? validAccent(String(formData.get("brandAccent") ?? "")),
    brand_contact_phone: cleanText(formData.get("brandContactPhone"), 40),
    brand_contact_email: cleanText(formData.get("brandContactEmail"), 120),
    theme_default: ["system", "light", "dark"].includes(themeRaw) ? themeRaw : null,
  });
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "WORKSPACE_BRANDING_UPDATED", detail: "Workspace branding updated",
  });
  await sql`update workspace_profiles set setup_completed = ${sql.json(markSetup(await currentSetup(orgId), "branding"))} where organization_id = ${orgId}`;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
}

/** Modules step — enabled/label per module key (fixed keys ignored). */
export async function saveModules(formData: FormData) {
  const session = await requireStudioWriter();
  const orgId = session.organizationId;
  const modules: Record<string, { enabled: boolean; label: string | null }> = {};
  for (const m of MODULES) {
    if (FIXED_MODULES.includes(m.key)) continue; // dashboard + settings always on
    const enabled = formData.get(`mod_${m.key}_on`) === "on";
    const label = cleanText(formData.get(`mod_${m.key}_label`), 40);
    modules[m.key] = { enabled, label };
  }
  await upsertWorkspaceProfile(orgId, { modules });
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "WORKSPACE_MODULES_UPDATED",
    detail: `Module layout saved (${Object.values(modules).filter((m) => m.enabled).length} shown)`,
  });
  await sql`update workspace_profiles set setup_completed = ${sql.json(markSetup(await currentSetup(orgId), "modules"))} where organization_id = ${orgId}`;
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
}

/** Guard helper for route handlers/actions. */
export async function isModuleEnabled(orgId: string, pathModule: string): Promise<boolean> {
  if (!isModule(pathModule)) return true;
  const p = await getWorkspaceProfile(orgId);
  return p.modules[pathModule as ModuleKey]?.enabled !== false;
}
