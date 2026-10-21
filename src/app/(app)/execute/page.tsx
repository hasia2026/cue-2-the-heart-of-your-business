import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { EXECUTE_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import ExecuteClient, { type Task as TaskRow, type WF as WFRow, type Rec as RecRow, type PendingRec } from "./ExecuteClient";

export const dynamic = "force-dynamic";

export default async function ExecutePage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;

  const tasks = await sql`
    select t.id, t.title, t.detail, t.status, t.priority, e.name as assignee, w.title as "workflowTitle"
    from tasks t
    left join employees e on e.id = t.assignee_id
    left join workflows w on w.id = t.workflow_id
    where t.organization_id = ${orgId}
    order by case t.status when 'OPEN' then 0 when 'IN_PROGRESS' then 1 else 2 end,
      case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end,
      t.created_at asc limit 60`;
  const workflows = await sql`
    select w.id, w.title, w.kind, w.status, w.rec_id as "recId",
      (select count(*) from tasks t where t.workflow_id = w.id)::int as "taskCount"
    from workflows w where w.organization_id = ${orgId} order by w.created_at desc limit 20`;
  const approvedRecs = await sql`
    select r.id, r.title, r.action from recommendations r
    where r.organization_id = ${orgId} and r.status = 'APPROVED' and r.workflow_id is null
    order by r.decided_at desc limit 10`;
  const pendingRecs = await sql`
    select r.id, r.title, r.action, r.impact_value as "impactValue" from recommendations r
    where r.organization_id = ${orgId} and r.status = 'PENDING'
    order by r.created_at desc limit 10`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Execute</h1>
        <p className="page-sub">Turn decisions into workflows, tasks, and outcomes. The human stays in control.</p>
      </div>
      <ExecuteClient
        tasks={tasks as unknown as TaskRow[]}
        workflows={workflows as unknown as WFRow[]}
        approvedRecs={approvedRecs as unknown as RecRow[]}
        pendingRecs={pendingRecs as unknown as PendingRec[]}
        canDecide={session.role !== "MEMBER"}
        labels={buildLabels(EXECUTE_LABEL_KEYS, t)}
      />
    </div>
  );
}
