import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const employees = await sql`
    select e.id, e.name, e.title, e.status, e.skills, e.email, d.name as department, m.name as manager,
      (select count(*) from tasks t where t.assignee_id = e.id and t.status in ('OPEN','IN_PROGRESS'))::int as open_tasks,
      (select count(*) from training_assignments ta where ta.employee_id = e.id)::int as trainings
    from employees e
    left join departments d on d.id = e.department_id
    left join employees m on m.id = e.manager_id
    where e.organization_id = ${orgId}
    order by d.name nulls last, e.name`;
  const departments = await sql`
    select d.id, d.name, d.description, (select count(*) from employees e where e.department_id = d.id)::int as headcount
    from departments d where d.organization_id = ${orgId} order by d.name`;
  const trainings = await sql`
    select t.id, t.title, t.category, t.summary,
      (select count(*) from training_assignments ta where ta.training_id = t.id)::int as assigned
    from training_modules t where t.organization_id = ${orgId} order by t.created_at desc limit 6`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">People</h1>
        <p className="page-sub">Employees, departments, roles, responsibilities — the org context CUE reasons with.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Employees</div><div className="kpi mt-1">{employees.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Departments</div><div className="kpi mt-1">{departments.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Training assignments</div><div className="kpi mt-1">{employees.reduce((a, e) => a + Number(e.trainings), 0)}</div></div>
      </div>

      <section className="card p-5">
        <h2 className="section-title mb-3">Departments</h2>
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
              <div className="font-medium text-navy-100">{d.name} <span className="badge-low ms-1">{d.headcount}</span></div>
              {d.description && <div className="text-xs text-navy-300">{d.description}</div>}
            </div>
          ))}
          {departments.length === 0 && <p className="muted">No departments yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3">Team</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => (
            <div key={e.id} className="card p-4">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-white">{e.name}</div>
                {e.status === "ACTIVE" ? <span className="badge-green ms-auto">active</span> : <span className="badge-low">{e.status}</span>}
              </div>
              <div className="muted mt-0.5 text-xs">{e.title}{e.department ? ` · ${e.department}` : ""}</div>
              {e.manager && <div className="mt-1 text-xs text-navy-300/70">reports to {e.manager}</div>}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-navy-300">
                <span className="badge-low">{e.open_tasks} open tasks</span>
                <span className="badge-low">{e.trainings} training</span>
              </div>
              {e.skills && <div className="mt-2 text-xs text-navy-300/80">Skills: {e.skills}</div>}
            </div>
          ))}
          {employees.length === 0 && <div className="card p-5 muted">No employees yet — add them in Settings → Team.</div>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="section-title mb-3">Training in motion</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {trainings.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/[0.06] px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-navy-100">{t.title}</span>
                <span className="badge-purple ms-auto">{t.category}</span>
              </div>
              <div className="muted mt-1 text-xs">{t.summary} · {t.assigned} assigned</div>
            </div>
          ))}
          {trainings.length === 0 && <p className="muted">No training modules yet — Expand builds them from your knowledge.</p>}
        </div>
      </section>
    </div>
  );
}
