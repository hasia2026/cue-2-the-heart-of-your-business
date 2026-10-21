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
import { renderQuoteHtml } from "@/lib/quote";
import { renderDigestHtml } from "@/lib/digest";

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

// ── Branding preview ──
// Renders the real quote-HTML and digest-HTML builders with the org's stored
// profile (or a dry-run variant built from form fields, so the owner can see
// unsaved choices first). Returns raw HTML strings; the form shows them in iframes.

export type PreviewInput = {
  brandName: string | null;
  accent: string | null;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

export async function previewBranding(
  form: Partial<Record<"brandName" | "brandAccent" | "brandAccentCustom" | "contactPhone" | "contactEmail" | "useUnsaved", FormDataEntryValue | null>>,
): Promise<{ ok: boolean; error?: string; quote?: string; digest?: string }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  // Dry-run variant from the unsaved form when asked; otherwise the stored profile.
  const useUnsaved = String(form.useUnsaved ?? "") === "1";
  const ws = await getWorkspaceProfile(orgId);
  const [orgRow] = await sql`select name from organizations where id = ${orgId}`;
  const orgName = (orgRow?.name as string) ?? "";
  const accent = useUnsaved
    ? validAccent(String(form.brandAccentCustom ?? "")) ?? validAccent(String(form.brandAccent ?? ""))
    : ws.brandAccent;
  const input: PreviewInput = {
    brandName: useUnsaved
      ? String(form.brandName ?? "").trim() || orgName
      : ws.brandNameOverride || orgName,
    accent,
    logoUrl: ws.brandLogoUrl,
    contactPhone: useUnsaved ? String(form.contactPhone ?? "").trim() || null : ws.brandContactPhone,
    contactEmail: useUnsaved ? String(form.contactEmail ?? "").trim() || null : ws.brandContactEmail,
  };

  // Real deterministic builders — only sample payloads differ.
  const sampleQuote = await sql`
    select c.name as customer_name, c.preferred_locale
    from customers c where c.organization_id = ${orgId} order by c.created_at desc limit 1`;
  const customer = sampleQuote[0];
  const quote = renderQuoteHtml(
    {
      customerName: customer?.customer_name as string ?? "Walk-in customer",
      customerEmail: null,
      title: "Sample estimate — see your branding on a real quote",
      items: [
        { description: "Sample line item", amount: 120 },
        { description: "Sample second item", amount: 240 },
      ],
      notes: "This is a preview only — nothing was sent.",
      validUntil: new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-US"),
    },
    (customer?.preferred_locale as string | null) ?? "en",
    { name: input.brandName, accent: input.accent, logo: input.logoUrl, contactPhone: input.contactPhone, contactEmail: input.contactEmail },
  );

  const digest = renderDigestHtml(buildSampleDigest(input.brandName ?? "Your business"), {
    name: input.brandName,
    accent: input.accent,
    logo: input.logoUrl,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
  });

  return { ok: true, quote, digest };
}

function buildSampleDigest(orgName: string) {
  return {
    orgName,
    openLeaks: { heading: "Open revenue leaks (1) — $4,951 at stake", lines: ["• [HIGH] Sample leak — $4,951 (preview)"] },
    pendingDecisions: { heading: "Decisions awaiting your approval (1)", lines: ["• Sample decision — $1,200 (preview)"] },
    actionItems: { heading: "Action items with owners (1 open)", lines: ["• [MEDIUM] Sample task — owner: (you)"] },
    approvedThisWeek: { heading: "Approvals this week (0)", lines: ["• No new approvals in the last 7 days."] },
    moneyFound: { heading: "Money found / recovered", lines: ["• Total recovered / protected: $0 (preview)"] },
  };
}

const LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const LOGO_MAX_BYTES = 200 * 1024;

export async function uploadLogo(formData: FormData) {
  const session = await requireStudioWriter();
  const orgId = session.organizationId;

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { ok: false as const, error: "Choose a logo file first." };
  if (!LOGO_MIMES.has(file.type)) {
    return { ok: false as const, error: "Logo must be PNG, JPEG, WebP, or SVG." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false as const, error: `Logo is too large (${Math.round(file.size / 1024)} KB) — 200 KB max.` };
  }

  const data = Buffer.from(await file.arrayBuffer());
  await sql`
    insert into workspace_logos (organization_id, mime, data, updated_at)
    values (${orgId}, ${file.type}, ${data}, now())
    on conflict (organization_id) do update set
      mime = excluded.mime, data = excluded.data, updated_at = now()`;
  const logoUrl = `/api/workspace/logo/${orgId}`;
  await upsertWorkspaceProfile(orgId, { brand_logo_url: logoUrl });

  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "WORKSPACE_LOGO_UPLOADED",
    detail: `Brand logo uploaded (${file.type}, ${Math.round(file.size / 1024)} KB)`,
  });
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true as const, error: null };
}

export async function removeLogo() {
  const session = await requireStudioWriter();
  const orgId = session.organizationId;
  await sql`delete from workspace_logos where organization_id = ${orgId}`;
  // Clears the stored URL too; a pasted external URL can be re-entered anytime.
  await sql`update workspace_profiles set brand_logo_url = null where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "WORKSPACE_LOGO_REMOVED", detail: "Brand logo removed",
  });
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  return { ok: true as const, error: null };
}
