import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { ACADEMY_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import Academy from "../Academy";

export const dynamic = "force-dynamic";

export default async function AcademyPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;

  const [profile] = await sql`select industry, mission, offerings, target_customers from business_profiles where organization_id = ${orgId}`;
  const myProgressRows = await sql`
    select track, lesson from academy_progress
    where organization_id = ${orgId} and user_id = ${session.user.id}`;
  const myAssignedRows = await sql`
    select track from academy_assignments
    where organization_id = ${orgId} and user_id = ${session.user.id}`;
  const memberRows = await sql`
    select u.id, u.name from members m join users u on u.id = m.user_id
    where m.organization_id = ${orgId} order by u.name`;
  const assignRows = await sql`
    select aa.id, aa.track, u.name,
      (select count(*) from academy_progress p
        where p.organization_id = aa.organization_id and p.user_id = aa.user_id and p.track = aa.track)::int as done
    from academy_assignments aa join users u on u.id = aa.user_id
    where aa.organization_id = ${orgId}
    order by aa.assigned_at desc`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/expand" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Expand</Link>
        <h1 className="page-title mt-2">Academy</h1>
        <p className="page-sub">Role-based tracks, assignments, and lesson progress that turn your playbook into team capability.</p>
      </div>

      <Academy
        industry={(profile?.industry as string) ?? ""}
        mission={(profile?.mission as string) ?? ""}
        customers={(profile?.target_customers as string) ?? ""}
        offerings={(profile?.offerings as string) ?? ""}
        labels={buildLabels(ACADEMY_LABEL_KEYS, t)}
        myProgress={myProgressRows.map((r) => `${r.track}.${r.lesson}`)}
        assignedTracks={myAssignedRows.map((r) => r.track as string)}
        canManage={session.role !== "MEMBER"}
        members={memberRows.map((m) => ({ id: m.id, name: m.name }))}
        team={assignRows.map((r) => ({ id: r.id, name: r.name, track: r.track as string, done: Number(r.done) }))}
      />
    </div>
  );
}
