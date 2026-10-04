"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteTeammateAction, changeRoleAction, removeMemberAction, switchOrganizationAction } from "./team-actions";

type Member = { id: string; name: string; email: string; role: string; joinedAt: string };
type Invited = { invitedName: string; email: string; role: string; tempPassword: string };

const ROLE_BADGE: Record<string, string> = {
  OWNER: "badge-purple",
  MANAGER: "badge-blue",
  MEMBER: "badge-low",
};
const ROLE_HELP: Record<string, string> = {
  OWNER: "Full control, including team management and billing decisions",
  MANAGER: "Runs the pipeline and operations day-to-day; cannot manage the team",
  MEMBER: "Works leads, tasks, and training; view-only on team settings",
};

export default function TeamClient({
  canManage,
  meEmail,
  members,
  myOrganizations,
  activeOrgId,
}: {
  canManage: boolean;
  meEmail: string;
  members: Member[];
  myOrganizations: { organizationId: string; name: string; role: string }[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState<Invited | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onInvite(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const result = (await inviteTeammateAction(formData)) as unknown as Invited & { ok: boolean };
      setInvited(result);
      setShowInvite(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="section-title">Team</h2>
        <span className="text-xs text-navy-400">{members.length} member{members.length === 1 ? "" : "s"}</span>
        {canManage && (
          <button onClick={() => { setShowInvite(!showInvite); setInvited(null); }} className="ml-auto btn-primary text-xs px-3 py-1.5">
            + Invite teammate
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 text-red-300 text-xs px-3 py-2">{error}</div>}

      {invited && (
        <div className="rounded-xl border border-blue-400/30 bg-blue-400/10 p-4 space-y-2">
          <div className="text-sm font-semibold text-blue-200">✓ {invited.invitedName} invited as {invited.role}</div>
          <p className="text-xs text-navy-500">
            Share these sign-in details with them (needs to be sent securely — e.g. text or a password manager share). They will be asked to keep or change it on first sign-in habits — for now, treat this as the workspace key.
          </p>
          <div className="flex items-center gap-3 flex-wrap rounded-xl bg-ink-950/60 border border-navy-50 px-3 py-2">
            <span className="text-xs text-navy-400">email:</span>
            <code className="text-xs text-navy-800 select-all">{invited.email}</code>
            <span className="text-xs text-navy-400 ml-2">temp password:</span>
            <code className="text-xs text-accent-blue select-all">{invited.tempPassword}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`You've been added to the CUE workspace.\nSign in at your CUE URL with:\nEmail: ${invited.email}\nTemporary password: ${invited.tempPassword}\n(You can reset it after signing in.)`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="ml-auto text-[11px] text-blue-300 hover:underline"
            >
              {copied ? "Copied ✓" : "Copy invite"}
            </button>
          </div>
        </div>
      )}

      {showInvite && canManage && (
        <form action={onInvite} className="grid sm:grid-cols-4 gap-2 items-end rounded-xl border border-navy-50 p-3">
          <label className="text-xs text-navy-400 sm:col-span-1">
            Name
            <input name="name" required className="input mt-1" placeholder="Dana Smith" />
          </label>
          <label className="text-xs text-navy-400 sm:col-span-1">
            Work email
            <input name="email" type="email" required className="input mt-1" placeholder="dana@dealer.com" />
          </label>
          <label className="text-xs text-navy-400 sm:col-span-1">
            Role
            <select name="role" defaultValue="MEMBER" className="input mt-1">
              <option value="MEMBER">Member (staff)</option>
              <option value="MANAGER">Manager</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <button disabled={busy} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
            {busy ? "Inviting…" : "Send invite"}
          </button>
          <p className="text-[11px] text-navy-300 sm:col-span-4">Creates the account with a temporary password you can share. Roles can be changed any time below.</p>
        </form>
      )}

      <div className="divide-y divide-navy-50">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 flex-wrap">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple text-white text-xs font-semibold flex items-center justify-center">
              {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-40">
              <div className="text-sm font-medium text-navy-800">
                {m.name} {m.email === meEmail && <span className="text-[11px] text-navy-300">(you)</span>}
              </div>
              <div className="text-[11px] text-navy-300">{m.email} · joined {new Date(m.joinedAt).toLocaleDateString()}</div>
            </div>
            <span className={`${ROLE_BADGE[m.role] ?? "badge-low"}`}>{m.role}</span>
            <div className="ml-auto flex items-center gap-2">
              {canManage && (
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => act(() => changeRoleAction(m.id, e.target.value))}
                  className="input text-xs py-1 px-2 w-28"
                  aria-label={`Role for ${m.name}`}
                >
                  <option value="OWNER">Owner</option>
                  <option value="MANAGER">Manager</option>
                  <option value="MEMBER">Member</option>
                </select>
              )}
              {canManage && m.email !== meEmail && (
                <button
                  disabled={busy}
                  onClick={() => { if (confirm(`Remove ${m.name} from this workspace?`)) act(() => removeMemberAction(m.id)); }}
                  className="text-xs text-navy-300 hover:text-red-400 px-1.5"
                  title="Remove from workspace"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-2 text-[11px] text-navy-300 pt-1">
        {(["OWNER", "MANAGER", "MEMBER"] as const).map((r) => (
          <div key={r} className="rounded-xl border border-navy-50 px-3 py-2">
            <span className={`${ROLE_BADGE[r]} mr-1.5`}>{r}</span>
            {ROLE_HELP[r]}
          </div>
        ))}
      </div>

      {myOrganizations.length > 1 && (
        <div className="border-t border-navy-50 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-300 mb-2">Your workspaces</div>
          <div className="flex gap-2 flex-wrap">
            {myOrganizations.map((o) => (
              <button
                key={o.organizationId}
                disabled={busy || o.organizationId === activeOrgId}
                onClick={() => act(() => switchOrganizationAction(o.organizationId))}
                className={`px-3 py-1.5 rounded-xl text-xs border transition-all ${o.organizationId === activeOrgId ? "border-accent-blue/50 text-white bg-accent-blue/15" : "border-navy-50 text-navy-400 hover:text-navy-800"}`}
              >
                {o.name} <span className="text-[10px] text-navy-300">· {o.role.toLowerCase()}</span>
                {o.organizationId === activeOrgId && " ✓"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-navy-300 mt-1.5">Switching moves your whole session into that workspace — its data is fully separate.</p>
        </div>
      )}
    </section>
  );
}
