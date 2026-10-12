"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/secretbox";
import { PROVIDERS } from "@/lib/ambassador";
import { VOCAB_LABELS, INDUSTRY_PACKS } from "@/lib/vocab";

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
