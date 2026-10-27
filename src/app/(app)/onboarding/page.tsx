import { requireSession } from "@/lib/auth";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { MODULES, FIXED_MODULES } from "@/lib/modules";
import { sql } from "@/lib/db";
import OnboardingWizard from "./Wizard";
import AvatarUpload from "@/components/AvatarUpload";
import { savePersona, saveBranding, saveModules } from "../settings/actions";

export const dynamic = "force-dynamic";

// Guided workspace setup — the skippable wizard (persona → branding → modules).
// Walkthrough for non-technical owners; DIY owners use Settings → Workspace Studio.
export default async function OnboardingPage() {
  const session = await requireSession();
  const ws = await getWorkspaceProfile(session.organizationId);
  const [orgRow] = await sql`select name from organizations where id = ${session.organizationId}`;
  const orgName = (orgRow?.name as string) ?? "";
  const canEdit = session.role !== "MEMBER";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Set up your workspace</h1>
        <p className="page-sub">
          Three quick steps to make CUE yours. Every step is skippable — you can change everything later in
          Settings → Workspace Studio.
        </p>
      </div>
      <AvatarUpload currentUrl={ws.ambassadorAvatarUrl} />
      <OnboardingWizard
        orgName={orgName}
        profile={ws}
        modules={MODULES.filter((m) => !FIXED_MODULES.includes(m.key))}
        canEdit={canEdit}
        actions={{ savePersona, saveBranding, saveModules }}
      />
    </div>
  );
}
