"use server";

// Public sign-up action (spec §2): no session, progressive-enhancement POST,
// same anonymous-action pattern the /signup page uses. Writes a PENDING
// plan_signups row and redirects back with ?done=1 — no account needed and
// nothing is charged. Rate-limited per IP like the other anonymous actions.
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { actionKey, allow } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function planSignup(fd: FormData) {
  const orgId = clean(fd, "orgId", 40);
  const planId = clean(fd, "planId", 40);
  const name = clean(fd, "name", 120);
  const email = clean(fd, "email", 200);
  const phone = clean(fd, "phone", 40);
  const address = clean(fd, "address", 200);
  const message = clean(fd, "message", 1000);
  // Attribution passthrough — validated, never trusted beyond the two known tokens.
  const srcParam = String(fd.get("src") ?? "");
  const source = srcParam === "quote" ? "QUOTE" : srcParam === "digest" ? "DIGEST" : "LINK";
  const sourceRef = clean(fd, "srcRef", 64) || null;

  const back = (err: string) =>
    redirect(`/plans/${orgId}?err=${err}${sourceRef ? `&src=${srcParam.slice(0, 8)}&ref=${encodeURIComponent(sourceRef)}` : ""}`);

  if (!UUID.test(orgId)) redirect("/signup");
  // 5 submissions / 10 min / IP — a person filling one form never trips this.
  if (!allow(await actionKey("plans"), 5, 10 * 60_000)) back("rate");

  const [plan] = await sql`
    select id, name, organization_id from service_plans
    where id = ${planId} and organization_id = ${orgId} and active = true`;
  if (!plan) back("plan");
  if (!name) back("name");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const phoneOk = /^\+?[0-9 ()\-]{7,20}$/.test(phone);
  if (!emailOk && !phoneOk) back("contact");

  // Match the submitter to a known customer by email so the owner sees the
  // relationship chip — best-effort, never blocks.
  let customerId: string | null = null;
  if (emailOk) {
    const [match] = await sql`
      select id from customers
      where organization_id = ${orgId} and lower(email) = lower(${email})
      limit 1`;
    if (match) customerId = match.id as string;
  }

  const [row] = await sql`
    insert into plan_signups
      (organization_id, plan_id, plan_name, customer_id, customer_matched,
       contact_name, contact_email, contact_phone, address, message, source, source_ref)
    values (${orgId}, ${planId}, ${plan!.name as string}, ${customerId}, ${customerId !== null},
      ${name}, ${emailOk ? email : null}, ${phoneOk ? phone : null}, ${address || null}, ${message || null},
      ${source}, ${sourceRef})
    returning id`;

  await logAudit({
    organizationId: orgId,
    actorType: "SYSTEM",
    action: "PLAN_SIGNUP_SUBMITTED",
    targetType: "PlanSignup",
    targetId: row!.id as string,
    detail: `${name} requested "${plan!.name as string}" via ${source.toLowerCase()}`,
    metadata: { matched: customerId !== null, email: emailOk ? email : null, phone: phoneOk ? phone : null },
  });

  redirect(`/plans/${orgId}?done=1`);
}
