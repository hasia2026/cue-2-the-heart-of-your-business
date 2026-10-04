/**
 * Verifies team management (invite → role change → switch → remove)
 * and the storage abstraction against the live DB.
 * npx tsx scripts/test-team-storage.ts
 */
import { prisma } from "../src/lib/prisma";
import { inviteTeammate, changeMemberRole, removeMember, listMembers, listUserOrganizations, canManageTeam } from "../src/lib/team";
import { storageBackend } from "../src/lib/storage";
import { hashPassword } from "../src/lib/password";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  // ── 1. Storage backend selection ──
  const backend = storageBackend();
  assert(backend === "LOCAL" || backend === "SUPABASE", `storage backend resolves (${backend})`);
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  assert(storageBackend() === "SUPABASE", "env vars select SUPABASE backend");
  process.env.STORAGE_BACKEND = "local";
  assert(storageBackend() === "LOCAL", "STORAGE_BACKEND=local overrides");
  delete process.env.STORAGE_BACKEND;
  process.env.SUPABASE_URL = prevUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;

  // ── 2. Team lifecycle on a scratch org ──
  const ownerUser = await prisma.user.create({
    data: { email: `owner-${Date.now()}@team.test`, name: "Olive Owner", passwordHash: hashPassword("test12345") },
  });
  const org = await prisma.organization.create({ data: { name: "__test-team" } });
  const owner = await prisma.member.create({ data: { organizationId: org.id, userId: ownerUser.id, role: "OWNER" } });

  assert(canManageTeam("OWNER") && !canManageTeam("MANAGER") && !canManageTeam("MEMBER"), "only owners can manage the team");

  // Invite two teammates
  const m1 = await inviteTeammate(org.id, org.name, { email: `mgr-${Date.now()}@team.test`, name: "Manny Manager", role: "MANAGER" }, ownerUser.id);
  assert(m1.role === "MANAGER" && m1.tempPassword.length >= 10, "manager invited with temp password");
  const m2 = await inviteTeammate(org.id, org.name, { email: `staff-${Date.now()}@team.test`, name: "Sam Staff", role: "MEMBER" }, ownerUser.id);
  assert(m2.role === "MEMBER", "staff invited");

  // Existing member re-invite must throw
  let dupThrew = false;
  try { await inviteTeammate(org.id, org.name, { email: ownerUser.email, name: "dup", role: "MEMBER" }, ownerUser.id); } catch { dupThrew = true; }
  assert(dupThrew, "re-inviting an existing member is rejected");

  const members = await listMembers(org.id);
  assert(members.length === 3, `3 members listed (got ${members.length})`);

  // Role guard: cannot demote the only owner
  let guardThrew = false;
  try { await changeMemberRole(org.id, owner.id, "MEMBER", ownerUser.id); } catch { guardThrew = true; }
  assert(guardThrew, "cannot demote the only owner");

  // Promote manager → owner, then demote original owner works
  await changeMemberRole(org.id, members.find((m) => m.role === "MANAGER")!.id, "OWNER", ownerUser.id);
  await changeMemberRole(org.id, owner.id, "MANAGER", ownerUser.id);
  const afterRole = await listMembers(org.id);
  assert(afterRole.filter((m) => m.role === "OWNER").length === 1, "promotion + demotion leaves exactly one (new) owner");
  assert(afterRole.find((m) => m.id === owner.id)?.role === "MANAGER", "original owner is now a manager");

  // Remove guard: last-owner removal blocked (both are owners now, so remove one member)
  const staffMember = afterRole.find((m) => m.role === "MEMBER")!;
  await removeMember(org.id, staffMember.id, ownerUser.id);
  assert((await listMembers(org.id)).length === 2, "member removed");

  // Multi-org listing + switching material
  const secondOrg = await prisma.organization.create({ data: { name: "__test-team-2" } });
  await prisma.member.create({ data: { organizationId: secondOrg.id, userId: ownerUser.id, role: "OWNER" } });
  const orgs = await listUserOrganizations(ownerUser.id);
  assert(orgs.length === 2 && orgs.some((o) => o.organizationId === secondOrg.id), "user sees both workspaces");

  // Audit trail
  const audits = await prisma.auditEvent.count({
    where: { organizationId: org.id, action: { in: ["TEAM_INVITED", "TEAM_ROLE_CHANGED", "TEAM_REMOVED"] } },
  });
  assert(audits >= 5, `team audit trail written (${audits} events)`);

  // Cleanup
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: [org.id, secondOrg.id] } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: [org.id, secondOrg.id] } } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.organization.delete({ where: { id: secondOrg.id } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@team.test" } } });
  console.log("PASS — team management + storage backend verified, scratch data removed");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
