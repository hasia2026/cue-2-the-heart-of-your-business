import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { moduleForPath } from "@/lib/modules";
import { headers } from "next/headers";

/**
 * Workspace Studio route guard: a module the org turned off falls back to the
 * dashboard instead of a dead end. Dashboard and /onboarding are never guarded.
 */
export async function guardWorkspaceModule(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/signin");
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? h.get("next-url") ?? "";
  if (pathIsExempt(pathname)) return;
  const mod = moduleForPath(pathname);
  if (!mod) return;
  const profile = await getWorkspaceProfile(session.organizationId);
  if (profile.modules[mod]?.enabled === false) redirect("/dashboard");
}

/** Same guard for server actions/route handlers — throws when disabled. */
export async function assertWorkspaceModule(pathname: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (pathIsExempt(pathname)) return;
  const mod = moduleForPath(pathname);
  if (!mod) return;
  const profile = await getWorkspaceProfile(session.organizationId);
  if (profile.modules[mod]?.enabled === false) throw new Error("This module is turned off in Workspace Studio.");
}

function pathIsExempt(pathname: string): boolean {
  return !pathname || pathname === "/dashboard" || pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}
