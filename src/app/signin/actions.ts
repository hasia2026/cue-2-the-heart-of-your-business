"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword, createSessionCookie, destroySession, requireSessionAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runDetectors } from "@/lib/intelligence";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim();
  if (!name || !email || !password || !orgName) throw new Error("All fields are required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const [existing] = await sql`select id from users where email = ${email}`;
  if (existing) throw new Error("An account with that email already exists");

  const [user] = await sql`
    insert into users (email, name, password_hash) values (${email}, ${name}, ${hashPassword(password)})
    returning id`;
  const [org] = await sql`
    insert into organizations (name) values (${orgName}) returning id`;
  await sql`insert into members (organization_id, user_id, role) values (${org.id}, ${user.id}, 'OWNER')`;
  await sql`
    insert into business_profiles (organization_id, name) values (${org.id}, ${orgName})`;
  await sql`insert into ai_settings (organization_id) values (${org.id})`;
  await logAudit({ organizationId: org.id, actorId: user.id, action: "ORG_CREATED", detail: orgName });
  await createSessionCookie(user.id);
  redirect("/dashboard");
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await sql`select id, password_hash from users where email = ${email}`;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password");
  }
  await createSessionCookie(user.id);
  redirect("/dashboard");
}

export async function signOut() {
  await requireSessionAction();
  await destroySession();
  redirect("/signin");
}

/** Compute intelligence for the caller's org (used after onboarding or by button). */
export async function refreshIntelligenceAction() {
  const session = await requireSessionAction();
  const created = await runDetectors(session.organizationId);
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "INTELLIGENCE_REFRESHED",
    detail: `${created} new insight(s)`,
  });
  return created;
}
