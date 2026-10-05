"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

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
