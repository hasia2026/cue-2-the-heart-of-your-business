// Smoke test for the rec→workflow service, run with tsx so @/ aliases resolve.
import { createWorkflowFromRecommendation } from "@/lib/workflows";
import { sql } from "@/lib/db";

async function main() {
  const [org] = (await sql`select o.id, o.name from organizations o where o.is_demo limit 1`) as { id: string; name: string }[];
  const [user] = (await sql`select id from users where email = 'demo@northgate.example'`) as { id: string }[];
  if (!org || !user) { console.error("Demo org or user missing — run seed first."); process.exit(1); }
  const [rec] = (await sql`
    select id, title from recommendations
    where organization_id = ${org.id} and status = 'APPROVED' and workflow_id is null limit 1`) as { id: string; title: string }[];
  if (!rec) { console.log("No approved rec awaiting workflow — approving stale-leads one first is required."); process.exit(0); }

  console.log("Rec:", rec.title);
  const result = await createWorkflowFromRecommendation(org.id, user.id, rec.id);
  console.log("createWorkflowFromRecommendation →", result);
  if (!result.ok || !result.workflowId || !result.taskCount) { console.error("FAIL"); process.exit(1); }

  const tasks = await sql`
    select title from tasks where workflow_id = ${result.workflowId} order by created_at limit 6`;
  console.log("Generated tasks:");
  for (const t of tasks) console.log("  •", t.title);
  process.exit(0);
}
main();
