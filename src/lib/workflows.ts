// Turns an approved recommendation into a concrete workflow with tasks.
// Task generation is data-driven from the insight's evidence, so tasks name
// the actual affected records rather than generic busywork.
import { sql } from "./db";
import { logAudit } from "./audit";
import { parseEvidence } from "./intelligence";

export async function createWorkflowFromRecommendation(
  organizationId: string,
  userId: string,
  recId: string
): Promise<{ ok: boolean; workflowId?: string; taskCount?: number; error?: string }> {
  const [rec] = await sql`
    select * from recommendations where id = ${recId} and organization_id = ${organizationId}`;
  if (!rec) return { ok: false, error: "Not found" };
  if (rec.status !== "APPROVED") {
    return { ok: false, error: "Approve the recommendation before creating a workflow." };
  }
  if (rec.workflow_id) return { ok: true, workflowId: rec.workflow_id, taskCount: 0 };

  const kind = guessKind(rec.title);
  const [wf] = await sql`
    insert into workflows (organization_id, rec_id, title, description, kind, source)
    values (${organizationId}, ${recId}, ${rec.title}, ${rec.rationale}, ${kind}, 'AI_RECOMMENDATION')
    returning id`;

  const tasks = await buildTasks(organizationId, wf.id, recId, rec.title);
  await sql`
    update recommendations set status = 'EXECUTED', workflow_id = ${wf.id} where id = ${recId}`;
  await sql`
    update insights set status = 'ACTION_TAKEN' where id = ${rec.insight_id} and rec_id = ${recId}`;

  await logAudit({
    organizationId,
    actorType: "USER",
    actorId: userId,
    action: "WORKFLOW_CREATED",
    targetType: "Workflow",
    targetId: wf.id,
    detail: `${rec.title} — ${tasks.length} task(s) generated`,
    metadata: { recId, kind },
  });
  return { ok: true, workflowId: wf.id, taskCount: tasks.length };
}

function guessKind(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("bill") || t.includes("invoice") || t.includes("collection")) return "BILLING";
  if (t.includes("lead") || t.includes("follow")) return "FOLLOW_UP";
  if (t.includes("price") || t.includes("inventory") || t.includes("aging")) return "PROCESS";
  return "CUSTOM";
}

async function buildTasks(organizationId: string, workflowId: string, recId: string, title: string) {
  const [rec] = await sql`select insight_id from recommendations where id = ${recId}`;
  const insightId = rec?.insight_id;
  const made: { title: string; detail: string }[] = [];

  if (insightId) {
    const [ins] = await sql`select evidence from insights where id = ${insightId}`;
    const { items } = parseEvidence(ins?.evidence);
    const queryRef = items.find((i) => i.kind === "QUERY");

    // Unbilled service orders → one task per order (max 10)
    if (queryRef?.ref === "service_orders") {
      const rows = await sql`
        select id, title, amount from service_orders
        where organization_id = ${organizationId} and status = 'COMPLETED' and invoiced_at is null
        order by completed_at asc limit 10`;
      for (const r of rows) {
        made.push({
          title: `Invoice: ${r.title}`,
          detail: `Confirm pricing ($${Number(r.amount).toFixed(2)}) and issue the invoice. Reference the 24h RO SOP.`,
        });
      }
    }

    // Stale leads → assign owners in batches
    if (queryRef?.ref === "leads") {
      const rows = await sql`
        select id, name, est_value from leads
        where organization_id = ${organizationId} and status in ('NEW','CONTACTED')
          and coalesce(last_contact_at, created_at) < now() - interval '5 days'
        order by created_at asc limit 15`;
      for (const r of rows) {
        made.push({
          title: `Call lead: ${r.name}`,
          detail: `48h recovery sprint — estimated value $${Number(r.est_value ?? 0).toLocaleString()}. Use the follow-up script.`,
        });
      }
    }

    // Aging inventory → reprice list
    if (queryRef?.ref === "vehicles") {
      const rows = await sql`
        select stock_number, year, make, model from vehicles
        where organization_id = ${organizationId} and status = 'AVAILABLE' and listed_at < now() - interval '60 days'
        order by listed_at asc`;
      for (const r of rows) {
        made.push({
          title: `Reprice ${r.year} ${r.make} ${r.model} (${r.stock_number})`,
          detail: "Apply the +$1,000 aging authority; consider wholesale if unsold in 14 days.",
        });
      }
    }
  }

  // Fallback: single action task from the recommendation itself
  if (made.length === 0) {
    made.push({ title, detail: "Execute the approved recommendation. See the linked insight for evidence." });
  }

  const [lead] = await sql`
    select e.id from employees e where e.organization_id = ${organizationId} and e.status='ACTIVE' order by e.hire_date asc limit 1`;
  const assignee = lead?.id ?? null;

  for (const t of made.slice(0, 20)) {
    await sql`
      insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin)
      values (${organizationId}, ${workflowId}, ${t.title}, ${t.detail}, 'OPEN', 'HIGH', ${assignee}, 'AI_RECOMMENDATION')`;
  }
  return made;
}
