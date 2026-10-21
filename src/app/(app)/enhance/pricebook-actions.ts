"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Price-book assemblies + multi-labor-rate services. Org-scoped, audited,
// MEMBER-blocked — the book is commercial data, not shop-floor notes.

const canManage = (role: string) => role === "OWNER" || role === "ADMIN" || role === "MANAGER";

export async function createOffering(formData: FormData) {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false as const, error: "Only owners, admins and managers can edit the price book." };
  const orgId = session.organizationId;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const partsCost = Number(String(formData.get("partsCost") ?? "0").replace(/[$,]/g, "")) || 0;
  const rateStandalone = Number(String(formData.get("rateStandalone") ?? "0").replace(/[$,]/g, "")) || 0;
  const rateAddon = Number(String(formData.get("rateAddon") ?? "0").replace(/[$,]/g, "")) || 0;
  const laborHours = Number(String(formData.get("laborHours") ?? "0")) || 0;
  if (!name) return { ok: false as const, error: "Name is required." };
  try {
    await sql`
      insert into service_offerings (organization_id, name, description, parts_cost,
        labor_rate_standalone, labor_rate_addon, labor_hours)
      values (${orgId}, ${name}, ${description}, ${partsCost}, ${rateStandalone}, ${rateAddon}, ${laborHours})`;
  } catch {
    return { ok: false as const, error: `“${name}” already exists in your book.` };
  }
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "OFFERING_CREATED", targetType: "ServiceOffering",
    detail: `${name} — standalone $${rateStandalone}/h, add-on $${rateAddon}/h${partsCost ? `, parts $${partsCost}` : ""}`,
  });
  revalidatePath("/enhance");
  return { ok: true as const };
}

export async function updateOfferingRates(
  offeringId: string,
  rateStandalone: number,
  rateAddon: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only owners, admins and managers can reprice the book." };
  const [offering] = await sql`
    select id, name from service_offerings
    where id = ${offeringId} and organization_id = ${session.organizationId}`;
  if (!offering) return { ok: false, error: "Offering not in your book." };
  await sql`
    update service_offerings set labor_rate_standalone = ${rateStandalone}, labor_rate_addon = ${rateAddon}
    where id = ${offering.id}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "OFFERING_REPRICED", targetType: "ServiceOffering", targetId: offering.id,
    detail: `${offering.name}: standalone → $${rateStandalone}/h, add-on → $${rateAddon}/h`,
  });
  revalidatePath("/enhance");
  return { ok: true };
}

export async function createAssembly(formData: FormData) {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false as const, error: "Only owners, admins and managers can build assemblies." };
  const orgId = session.organizationId;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const offeringIds = formData.getAll("offeringId").map(String);
  const modes = formData.getAll("pricingMode").map(String);
  if (!name) return { ok: false as const, error: "Assembly name is required." };
  if (!offeringIds.length) return { ok: false as const, error: "Pick at least one service to bundle." };
  try {
    await sql`insert into service_assemblies (organization_id, name, description) values (${orgId}, ${name}, ${description}) returning id`;
  } catch {
    return { ok: false as const, error: `“${name}” already exists.` };
  }
  const [created] = await sql`select id from service_assemblies where organization_id = ${orgId} and name = ${name}`;
  for (let i = 0; i < offeringIds.length; i++) {
    const [offering] = await sql`select id from service_offerings where id = ${offeringIds[i]} and organization_id = ${orgId}`;
    if (!offering) continue; // forged id: skip silently, the org owns what it can see
    const mode = modes[i] === "ADDON" ? "ADDON" : "STANDALONE";
    await sql`
      insert into service_assembly_items (assembly_id, offering_id, position, pricing_mode)
      values (${created.id}, ${offering.id}, ${i}, ${mode})
      on conflict (assembly_id, offering_id) do update set position = excluded.position, pricing_mode = excluded.pricing_mode`;
  }
  await logAudit({
    organizationId: orgId, actorId: session.user.id,
    action: "ASSEMBLY_CREATED", targetType: "ServiceAssembly",
    detail: `${name}: ${offeringIds.length} line(s)`,
    metadata: { lines: offeringIds.length },
  });
  revalidatePath("/enhance");
  return { ok: true as const };
}

export async function deleteAssembly(assemblyId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!canManage(session.role)) return { ok: false, error: "Only owners, admins and managers can delete assemblies." };
  const [asm] = await sql`
    select id, name from service_assemblies
    where id = ${assemblyId} and organization_id = ${session.organizationId}`;
  if (!asm) return { ok: false, error: "Assembly not in your book." };
  await sql`delete from service_assemblies where id = ${asm.id}`;
  await logAudit({
    organizationId: session.organizationId, actorId: session.user.id,
    action: "ASSEMBLY_DELETED", targetType: "ServiceAssembly", targetId: asm.id,
    detail: `${asm.name} deleted`,
  });
  revalidatePath("/enhance");
  return { ok: true };
}
