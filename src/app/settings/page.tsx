import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { listMembers, listUserOrganizations, canManageTeam } from "@/lib/team";
import { storageBackend } from "@/lib/storage";
import AppShell from "@/components/AppShell";
import SettingsClient from "./SettingsClient";
import TeamClient from "./TeamClient";
import ChangePasswordClient from "./ChangePasswordClient";

export default async function SettingsPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [ai, profile, auditCount, members, myOrgs] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { organizationId: orgId } }),
    prisma.businessProfile.findUnique({ where: { organizationId: orgId } }),
    prisma.auditEvent.count({ where: { organizationId: orgId } }),
    listMembers(orgId),
    listUserOrganizations(session.user.id),
  ]);

  const manage = canManageTeam(session.role);

  return (
    <AppShell crumb="Settings">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Settings</h1>
          <p className="muted mt-1">Business configuration, team, AI controls, and security posture.</p>
        </div>

        <ChangePasswordClient />

        <TeamClient
          canManage={manage}
          meEmail={session.user.email}
          members={members.map((m) => ({
            id: m.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            joinedAt: m.createdAt.toISOString(),
          }))}
          myOrganizations={myOrgs}
          activeOrgId={orgId}
        />

        <SettingsClient
          ai={{
            observe: ai?.observe ?? true,
            recommend: ai?.recommend ?? true,
            prepare: ai?.prepare ?? true,
            execute: ai?.execute ?? false,
            automate: ai?.automate ?? false,
          }}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="section-title mb-3">Business configuration</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Organization" v={session.organizationName} />
              <Row k="Your role" v={session.role} />
              <Row k="Signed in as" v={`${session.user.name} · ${session.user.email}`} />
              <Row k="Industry" v={profile?.industry ?? "—"} />
              <Row k="Members" v={String(members.length)} />
              <Row k="File storage" v={storageBackend() === "SUPABASE" ? "Supabase Storage (persistent)" : "Local disk (dev)"} />
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3">Security & auditability</h2>
            <ul className="space-y-2 text-sm text-navy-700">
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Sessions are HMAC-signed, http-only cookies with 30-day expiry</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Passwords hashed with scrypt + per-user salt; invites use one-time temp passwords</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> All queries scoped to your organization (org-level isolation); workspace switching is membership-verified</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Only owners can manage the team; every workspace keeps at least one owner</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> {auditCount} audit events recorded — every AI insight, human decision, workflow, and team change</li>
              <li className="flex gap-2"><span className="text-emerald-500">✓</span> Secrets live in environment variables, never in client code</li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-navy-50 pb-2">
      <dt className="text-navy-400">{k}</dt>
      <dd className="text-navy-800 text-right">{v}</dd>
    </div>
  );
}
