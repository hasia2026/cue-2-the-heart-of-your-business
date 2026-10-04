"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { refreshIntelligence } from "@/lib/intelligence";

const DetailsSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  industry: z.string().min(2).max(120),
  size: z.string().min(1).max(40),
  locations: z.string().trim().max(200).optional().or(z.literal("")),
  businessModel: z.string().trim().max(400).optional().or(z.literal("")),
  targetCustomers: z.string().trim().max(400).optional().or(z.literal("")),
  mission: z.string().trim().max(600).optional().or(z.literal("")),
});

export async function saveBusinessDetails(formData: FormData) {
  const session = await requireSessionAction();
  const parsed = DetailsSchema.safeParse({
    companyName: formData.get("companyName"),
    industry: formData.get("industry"),
    size: formData.get("size"),
    locations: formData.get("locations") ?? "",
    businessModel: formData.get("businessModel") ?? "",
    targetCustomers: formData.get("targetCustomers") ?? "",
    mission: formData.get("mission") ?? "",
  });
  if (!parsed.success) redirect("/onboarding?error=details");

  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: {
      name: parsed.data.companyName,
      industry: parsed.data.industry,
      size: parsed.data.size,
      locations: parsed.data.locations || null,
      businessModel: parsed.data.businessModel || null,
      targetCustomers: parsed.data.targetCustomers || null,
      mission: parsed.data.mission || null,
      onboardingStep: 3,
    },
  });
  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { name: parsed.data.companyName },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_BUSINESS_DETAILS",
    detail: `${parsed.data.companyName} — ${parsed.data.industry}`,
  });

  redirect("/onboarding");
}

const GoalsSchema = z.object({
  goal1: z.string().trim().max(160).optional().or(z.literal("")),
  goal2: z.string().trim().max(160).optional().or(z.literal("")),
  goal3: z.string().trim().max(160).optional().or(z.literal("")),
});

export async function saveGoals(formData: FormData) {
  const session = await requireSessionAction();
  const parsed = GoalsSchema.safeParse({
    goal1: formData.get("goal1") ?? "",
    goal2: formData.get("goal2") ?? "",
    goal3: formData.get("goal3") ?? "",
  });
  if (!parsed.success) redirect("/onboarding?error=goals");

  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!profile) redirect("/onboarding");

  await prisma.goal.deleteMany({ where: { profileId: profile.id } });
  const titles = [parsed.data.goal1, parsed.data.goal2, parsed.data.goal3]
    .map((g) => (g ?? "").trim())
    .filter(Boolean);
  if (titles.length > 0) {
    await prisma.goal.createMany({
      data: titles.map((title) => ({ profileId: profile.id, title, horizon: "YEAR" })),
    });
  }

  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: { onboardingStep: 4 },
  });

  await logAudit({
    organizationId: session.organizationId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_GOALS",
    detail: titles.length ? titles.join(" · ") : "No goals set",
  });

  redirect("/onboarding");
}

export async function backToDetails() {
  await requireSessionAction();
  redirect("/onboarding?step=2");
}

/** Optional: generate a small set of realistic records for the chosen
 *  industry so the intelligence engine has something to analyze.
 *  Clearly labeled as sample activity — the user's profile stays their own. */
export async function addStarterData() {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId: orgId } });
  if (!profile) redirect("/onboarding");

  const existing = await prisma.customer.count({ where: { organizationId: orgId } });
  if (existing > 0) {
    await prisma.businessProfile.update({ where: { organizationId: orgId }, data: { onboardingStep: 5 } });
    redirect("/onboarding");
  }

  const isAuto = (profile.industry ?? "").toLowerCase().includes("auto") ||
    (profile.industry ?? "").toLowerCase().includes("dealership");

  // Shared demo-data generators reuse the same shapes as the demo seeds,
  // scoped to the user's own organization.
  const { spawnStarterData } = await import("@/lib/starter-data");
  await spawnStarterData(orgId, isAuto ? "AUTO" : "HOME");

  await prisma.businessProfile.update({ where: { organizationId: orgId }, data: { onboardingStep: 5 } });
  await logAudit({
    organizationId: orgId,
    actorType: "USER",
    actorId: session.user.id,
    action: "ONBOARDING_STARTER_DATA",
    detail: "Sample activity generated for analysis",
  });
  redirect("/onboarding");
}

export async function skipStarterData() {
  const session = await requireSessionAction();
  await prisma.businessProfile.update({
    where: { organizationId: session.organizationId },
    data: { onboardingStep: 5 },
  });
  redirect("/onboarding");
}

export async function finishSetup() {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const created = await refreshIntelligence(orgId);
  await prisma.businessProfile.update({
    where: { organizationId: orgId },
    data: { onboardingStep: 10 },
  });

  await logAudit({
    organizationId: orgId,
    actorType: "AI",
    action: "COMPASS_INITIALIZED",
    detail: `First Company Compass built — ${created} initial insight(s) from available data`,
  });

  revalidatePath("/compass");
  revalidatePath("/dashboard");
  redirect("/compass?welcome=1");
}
