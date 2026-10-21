import { getSession } from "@/lib/auth";
import { getWorkspaceProfile, DEFAULT_WORKSPACE_PROFILE, type WorkspaceProfile } from "@/lib/workspace-profile";

/** Persona props for the Ambassador widget — null session → stock identity. */
export async function getAmbassadorPersona(): Promise<{
  name: string;
  avatar: string;
  greeting: string | null;
  tone: WorkspaceProfile["ambassadorTone"];
}> {
  const session = await getSession();
  if (!session) return { name: "AI Ambassador", avatar: "🦋", greeting: null, tone: null };
  const p = await getWorkspaceProfile(session.organizationId);
  return {
    name: p.ambassadorName ?? "AI Ambassador",
    avatar: p.ambassadorAvatar ?? "🦋",
    greeting: p.ambassadorGreeting,
    tone: p.ambassadorTone,
  };
}

export { DEFAULT_WORKSPACE_PROFILE };
