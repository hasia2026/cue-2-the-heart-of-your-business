"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getWorkspaceProfile } from "@/lib/workspace-profile";

/**
 * One-time guided-tour dismissal. The flag lives on the org's workspace profile
 * (`setup_completed.tour`) alongside the wizard steps, so it follows the org,
 * not a browser — every first sign-in shows the tour exactly once, and nobody
 * re-sees it after "Skip" / completing it.
 */
export async function markTourDone(): Promise<{ ok: boolean }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const p = await getWorkspaceProfile(orgId);
  if (p.setupCompleted.tour) return { ok: true };
  // Upsert, not update: brand-new orgs have no workspace_profiles row yet
  // (rows are only created on first save), and a plain UPDATE would silently
  // match zero rows and the tour would re-appear on the next sign-in.
  await sql`insert into workspace_profiles (organization_id, setup_completed)
    values (${orgId}, ${sql.json({ tour: true })}::jsonb)
    on conflict (organization_id) do update set
      setup_completed = coalesce(workspace_profiles.setup_completed, '{}'::jsonb) || ${sql.json({ tour: true })}::jsonb,
      updated_at = now()`;
  revalidatePath("/", "layout");
  return { ok: true };
}
