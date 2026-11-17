import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { addProjectTask, closeProject, completeProjectTask, createProject } from "./actions";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string; title: string; description: string | null; status: string;
  dueAt: string | null; taskCount: number; doneCount: number;
};
type TaskRow = {
  id: string; projectId: string; title: string; status: string;
  priority: string; dueAt: string | null; assignee: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

export default async function ProjectsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const projectRows = await sql`
    select p.id, p.title, p.description, p.status, p.due_at as "dueAt",
      (count(t.id))::int as "taskCount",
      (count(t.id) filter (where t.status = 'DONE'))::int as "doneCount"
    from projects p
    left join tasks t on t.project_id = p.id
    where p.organization_id = ${orgId}
    group by p.id
    order by (p.status = 'ACTIVE') desc, p.due_at asc nulls last, p.title asc`;
  const projects = projectRows as unknown as ProjectRow[];

  const taskRows = await sql`
    select t.id, t.project_id as "projectId", t.title, t.status, t.priority, t.due_at as "dueAt", e.name as assignee
    from tasks t
    left join employees e on e.id = t.assignee_id
    where t.organization_id = ${orgId} and t.project_id is not null
    order by case t.status when 'OPEN' then 0 when 'IN_PROGRESS' then 1 else 2 end,
      t.due_at asc nulls last`;
  const tasks = taskRows as unknown as TaskRow[];

  const employees = await sql`select id, name from employees where organization_id = ${orgId} order by name`;
  const canEdit = session.role !== "MEMBER";
  const active = projects.filter((p) => p.status === "ACTIVE");
  const totalTasks = projects.reduce((n, p) => n + p.taskCount, 0);
  const doneTasks = projects.reduce((n, p) => n + p.doneCount, 0);
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Projects</h1>
        <p className="page-sub">Multi-step work with an owner and a deadline — projects hold tasks, tasks drive the percentage.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Active projects</div><div className="kpi mt-1">{active.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Tasks complete</div><div className="kpi mt-1">{doneTasks}/{totalTasks}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Overall progress</div><div className="kpi mt-1">{pct}%</div></div>
      </div>

      {canEdit && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white">New project</summary>
          <form action={createProject} className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="project-title">Title</label>
              <input id="project-title" name="title" className="input" placeholder="e.g. Rebook every lapsed regular" required />
            </div>
            <div>
              <label className="label" htmlFor="project-due">Target date (optional)</label>
              <input id="project-due" name="dueAt" type="date" className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="project-desc">What done looks like</label>
              <input id="project-desc" name="description" className="input" placeholder="One sentence the team can act on" />
            </div>
            <div className="md:col-span-2">
              <button className="btn-primary text-sm">Create project</button>
            </div>
          </form>
        </details>
      )}

      {projects.length === 0 && (
        <div className="card p-6 muted">No projects yet. Create one above, or approve a recommendation and its workflow tasks can carry a project.</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => {
          const rows = tasks.filter((t) => t.projectId === p.id);
          const percent = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
          return (
            <section key={p.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{p.title}</span>
                <span className={`badge ms-auto ${p.status === "ACTIVE" ? "badge-green" : "badge-low"}`}>{p.status}</span>
              </div>
              {p.description && <p className="muted mt-1 text-xs">{p.description}</p>}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-navy-300">
                <span>{p.doneCount}/{p.taskCount} tasks</span>
                {p.dueAt && <span>· due {fmtDate(p.dueAt)}</span>}
                <span className="ms-auto">{percent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-cue-green" style={{ width: `${percent}%` }} />
              </div>

              <div className="mt-3 space-y-1.5">
                {rows.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-1.5">
                    <span className={`text-sm ${t.status === "DONE" ? "text-navy-300 line-through" : "text-navy-100"}`}>{t.title}</span>
                    <span className={`badge ${t.priority === "HIGH" ? "badge-red" : "badge-low"}`}>{t.priority}</span>
                    {t.assignee && <span className="text-[11px] text-navy-300/70">{t.assignee}</span>}
                    {t.dueAt && <span className="text-[11px] text-navy-300/70">due {fmtDate(t.dueAt)}</span>}
                    {t.status !== "DONE" && (
                      <form action={completeProjectTask} className="ms-auto">
                        <input type="hidden" name="taskId" value={t.id} />
                        <button className="btn-ghost !px-2 !py-0.5 text-[11px]">Done</button>
                      </form>
                    )}
                  </div>
                ))}
                {rows.length === 0 && <div className="muted text-xs">No tasks yet.</div>}
              </div>

              <form action={addProjectTask} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="projectId" value={p.id} />
                <input name="title" className="input min-w-[10rem] flex-1 !py-1.5 text-sm" placeholder="Add a task" required />
                <select name="priority" className="input !w-auto !py-1.5 text-xs" defaultValue="MEDIUM">
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
                <select name="assigneeId" className="input !w-auto !py-1.5 text-xs" defaultValue="">
                  <option value="">Unassigned</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input name="dueAt" type="date" className="input !w-auto !py-1.5 text-xs" />
                <button className="btn-primary !py-1.5 text-xs">Add</button>
              </form>

              {canEdit && p.status === "ACTIVE" && (
                <form action={closeProject} className="mt-2">
                  <input type="hidden" name="projectId" value={p.id} />
                  <button className="btn-ghost !px-2 !py-1 text-[11px]">Mark complete</button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
