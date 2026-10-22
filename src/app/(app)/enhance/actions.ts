"use server";

import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";

// ── Service-plan catalog (spec §4) — owner/admin/manager only ─────────
// Members can read the plans page data but cannot edit or decide.
async function requirePlanEditor() {
  const session = await requireSession();
  if (session.role === "MEMBER") throw new Error("Owner, admin or manager access required.");
  return session;
}

// Sends a Pricing Studio decision to Execute as a PENDING recommendation.
// A manager approves or rejects it there; approval feeds the existing
// recommendation → workflow → tasks pipeline.
export async function requestPriceApproval(fd: FormData): Promise<void> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  const action = String(fd.get("action") ?? "").trim().slice(0, 1000);
  const rationale = String(fd.get("rationale") ?? "").trim().slice(0, 2000);
  const impact = Number(fd.get("impact") ?? NaN);
  if (!title || !action || !rationale) return;

  await sql`
    insert into recommendations (organization_id, title, action, rationale, impact_value, status, confidence)
    values (${orgId}, ${title}, ${action}, ${rationale},
      ${Number.isFinite(impact) && impact > 0 ? impact : null}, 'PENDING', 0.9)`;
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "PRICE_APPROVAL_REQUESTED",
    targetType: "Recommendation",
    detail: title,
  });
  revalidatePath("/execute");
  revalidatePath("/enhance");
}

export type ActionResult = { ok: boolean; error?: string };

/** Create or update a plan in the org's sign-up catalog. */
export async function savePlan(fd: FormData): Promise<ActionResult> {
  const session = await requirePlanEditor();
  const orgId = session.organizationId;
  const id = String(fd.get("id") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const blurb = String(fd.get("blurb") ?? "").trim().slice(0, 400) || null;
  const annualValue = Math.max(0, Number(fd.get("annualValue") ?? 0)) || 0;
  const visitsRaw = Number(fd.get("visitsPerYear") ?? NaN);
  const visitsPerYear = Number.isFinite(visitsRaw) && visitsRaw > 0 ? Math.round(visitsRaw) : null;
  const featured = fd.get("featured") === "on" || fd.get("featured") === "1";
  const active = fd.get("active") === "on" || fd.get("active") === "1";
  if (!name) return { ok: false, error: "Plan name is required." };

  try {
    if (id) {
      // Scope every update by org — a tampered id cannot cross tenants.
      const rows = await sql`
        update service_plans set name = ${name}, blurb = ${blurb}, annual_value = ${annualValue},
               visits_per_year = ${visitsPerYear}, featured = ${featured}, active = ${active}
        where id = ${id} and organization_id = ${orgId} returning id`;
      if (!rows.length) return { ok: false, error: "Plan not found in your organization." };
      await logAudit({
        organizationId: orgId, actorId: session.user.id, actorType: "USER",
        action: "PLAN_UPDATED", targetType: "ServicePlan", targetId: id, detail: name,
      });
    } else {
      const [row] = await sql`
        insert into service_plans (organization_id, name, blurb, annual_value, visits_per_year, featured, active)
        values (${orgId}, ${name}, ${blurb}, ${annualValue}, ${visitsPerYear}, ${featured}, ${active})
        returning id`;
      await logAudit({
        organizationId: orgId, actorId: session.user.id, actorType: "USER",
        action: "PLAN_CREATED", targetType: "ServicePlan", targetId: String(row!.id), detail: name,
      });
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return { ok: false, error: "A plan with that name already exists." };
    throw e;
  }
  revalidatePath("/enhance");
  return { ok: true };
}

/** Remove a plan from the catalog. Existing sign-ups keep their snapshot. */
export async function deletePlan(fd: FormData): Promise<ActionResult> {
  const session = await requirePlanEditor();
  const orgId = session.organizationId;
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Plan id missing." };
  const rows = await sql`
    delete from service_plans where id = ${id} and organization_id = ${orgId} returning name`;
  if (!rows.length) return { ok: false, error: "Plan not found in your organization." };
  await logAudit({
    organizationId: orgId, actorId: session.user.id, actorType: "USER",
    action: "PLAN_DELETED", targetType: "ServicePlan", targetId: id, detail: String(rows[0]!.name),
  });
  revalidatePath("/enhance");
  return { ok: true };
}

/** One-click convert: pending sign-up → customer (matched or created) + ACTIVE agreement.
 *  Void action driven by a plain form submit (works with JS off in verification);
 *  failures redirect back with ?planErr=… so the reason is always visible. */
export async function convertSignup(fd: FormData): Promise<void> {
  const session = await requirePlanEditor();
  const orgId = session.organizationId;
  const signupId = String(fd.get("signupId") ?? "").trim();
  if (!signupId) redirect(`/enhance?planErr=${encodeURIComponent("Sign-up id missing.")}`);

  const [s] = await sql`
    select id, plan_name, plan_id, contact_name, contact_email, contact_phone, address, customer_id, status, source, source_ref
    from plan_signups
    where id = ${signupId} and organization_id = ${orgId}`;
  const signup = s as Record<string, unknown> | undefined;
  if (!signup) redirect(`/enhance?planErr=${encodeURIComponent("Sign-up not found in your organization.")}`);
  if (signup.status !== "PENDING") redirect(`/enhance?planErr=${encodeURIComponent("This request was already decided.")}`);

  // Customer: use the matched one, else match by email, else create.
  let customerId = signup.customer_id as string | null;
  if (!customerId) {
    const email = (signup.contact_email as string | null)?.toLowerCase() ?? "";
    if (email) {
      const [c] = await sql`
        select id from customers where organization_id = ${orgId} and lower(email) = ${email} limit 1`;
      if (c) customerId = c.id as string;
    }
  }
  if (!customerId) {
    const sName = String(signup.contact_name ?? "");
    const sEmail = (signup.contact_email as string | null) ?? null;
    const sPhone = (signup.contact_phone as string | null) ?? null;
    const sAddress = (signup.address as string | null) ?? null;
    const [c] = await sql`
      insert into customers (organization_id, name, email, phone, address)
      values (${orgId}, ${sName}, ${sEmail}, ${sPhone}, ${sAddress})
      returning id`;
    customerId = c!.id as string;
  }

  // Snapshot the plan's current price FIRST (sequential queries — a nested
  // await inside an insert template is unreliable over pooled connections).
  const [pr] = await sql`select annual_value from service_plans where id = ${signup.plan_id as string}`;

  // Live agreement — the partial unique index can reject if this customer
  // already has one; surface it honestly instead of crashing.
  let agreementId: string;
  try {
    const [a] = await sql`
      insert into maintenance_agreements (organization_id, customer_id, plan_name, annual_value, notes)
      values (${orgId}, ${customerId}, ${signup.plan_name as string},
        ${pr?.annual_value ?? 0},
        ${`From plan sign-up (${"source" in signup ? String(signup.source) : "link"}${signup.source_ref ? ` ${signup.source_ref}` : ""}) via /plans`})
      returning id`;
    agreementId = a!.id as string;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      redirect(`/enhance?planErr=${encodeURIComponent("This customer already has a live agreement — resolve or cancel that one first.")}`);
    }
    throw e;
  }

  await sql`
    update plan_signups
    set status = 'CONVERTED', agreement_id = ${agreementId}, customer_id = ${customerId},
        customer_matched = true, decided_at = now(), decided_by = ${session.user.id}
    where id = ${signupId}`;
  await logAudit({
    organizationId: orgId, actorId: session.user.id, actorType: "USER",
    action: "PLAN_SIGNUP_CONVERTED", targetType: "PlanSignup", targetId: signupId,
    detail: `${signup.contact_name as string} → active agreement "${signup.plan_name as string}"`,
  });
  revalidatePath("/enhance");
  revalidatePath("/pipeline");
}

/** Owner-to-owner dismiss: interested but not ready. */
export async function dismissSignup(fd: FormData): Promise<void> {
  const session = await requirePlanEditor();
  const orgId = session.organizationId;
  const signupId = String(fd.get("signupId") ?? "").trim();
  if (!signupId) redirect(`/enhance?planErr=${encodeURIComponent("Sign-up id missing.")}`);
  const rows = await sql`
    update plan_signups set status = 'DISMISSED', decided_at = now(), decided_by = ${session.user.id}
    where id = ${signupId} and organization_id = ${orgId} and status = 'PENDING'
    returning id`;
  if (!rows.length) redirect(`/enhance?planErr=${encodeURIComponent("Sign-up not found or already decided.")}`);
  await logAudit({
    organizationId: orgId, actorId: session.user.id, actorType: "USER",
    action: "SIGNUP_DISMISSED", targetType: "PlanSignup", targetId: signupId,
  });
  revalidatePath("/enhance");
}
