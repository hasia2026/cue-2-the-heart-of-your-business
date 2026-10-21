import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import ShiftGrid, { type Cell } from "./ShiftGrid";
import ReadingQueue, { type ReadingItem } from "./ReadingQueue";

export const dynamic = "force-dynamic";

const money = (n: unknown) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function PeoplePage() {
  await guardWorkspaceModule();
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
  // Sales leaderboard — per-consultant closed units + gross from deal closer
  // attribution. Rendered only when at least one deal has a closer.
  const salesBoard = await sql`
    select e.id, e.name, e.title,
      count(*) filter (where d.status = 'WON')::int as won_units,
      coalesce(sum(d.amount) filter (where d.status = 'WON'), 0)::numeric(14,2) as won_gross,
      count(*) filter (where d.status in ('NEGOTIATING','PENDING_FINANCE'))::int as open_deals,
      coalesce(sum(d.amount) filter (where d.status in ('NEGOTIATING','PENDING_FINANCE')), 0)::numeric(14,2) as open_value
    from employees e
    join deals d on d.sold_by_id = e.id and d.organization_id = ${orgId}
    where e.organization_id = ${orgId}
    group by e.id, e.name, e.title
    order by won_gross desc, open_value desc`;
  // The standing week — any industry: HVAC techs, salon chairs, sales floor.
  // Missing rows render as OFF; Members see the grid read-only.
  const shiftEmployees = await sql`
    select e.id, e.name, e.title, e.status
    from employees e where e.organization_id = ${orgId}
    order by e.name`;
  const shiftRows = await sql`
    select employee_id as "employeeId", day_of_week as "day", shift
    from employee_shifts where organization_id = ${orgId}`;
  const initialCells = shiftRows.map((r) => ({ employeeId: r.employeeId, day: r.day, shift: r.shift as Cell["shift"] }));
  const canEditShifts = session.role !== "MEMBER";
  // Policy-update acknowledgments — updates push a re-read; outstanding ones
  // seat here until a manager ticks them (nobody can claim they were never told).
  const readingRows = await sql`
    select ra.id, ra.note, ra.assigned_at, e.name as employee, d.title as document_title
    from reading_assignments ra
    join employees e on e.id = ra.employee_id
    join documents d on d.id = ra.document_id
    where ra.organization_id = ${orgId} and ra.status = 'ASSIGNED'
    order by ra.assigned_at asc limit 20`;
  const readingItems: ReadingItem[] = readingRows.map((r) => ({
    id: r.id,
    employee: r.employee,
    documentTitle: r.document_title,
    note: r.note,
    assignedAt: String(r.assigned_at),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">People</h1>
        <p className="page-sub">Employees, departments, roles, responsibilities — the org context CUE reasons with.</p>
      </div>

      {/* Who sold what — the dealership's closer leaderboard. Hidden until a
          deal carries attribution; renders gross-first like the DMS boards a
          GM already reads. */}
      {salesBoard.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-1">Sales leaderboard</h2>
          <p className="muted mb-3 text-xs">Closed units and gross by closer of record — plus what each still has open.</p>
          <div className="space-y-2">
            {salesBoard.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] px-3.5 py-2.5">
                <span className={`badge ${i === 0 ? "badge-green" : "badge-low"}`}>{i === 0 ? "leader" : `#${i + 1}`}</span>
                <span className="font-medium text-navy-100">{s.name}</span>
                <span className="text-xs text-navy-300">{s.title}</span>
                <span className="ms-auto flex flex-wrap gap-2 text-xs">
                  <span className="badge-green">{s.won_units} units · {money(s.won_gross)} closed</span>
                  <span className="badge-blue">{s.open_deals} open · {money(s.open_value)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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

      <section className="card p-5">
        <h2 className="section-title mb-1">Weekly schedule</h2>
        <p className="muted mb-3 text-xs">The standing week — the one people actually live by. Owners, admins and managers edit it; everyone sees it.</p>
        <ShiftGrid employees={shiftEmployees as never} initial={initialCells} canEdit={canEditShifts} />
      </section>

      <section className="card p-5">
        <h2 className="section-title mb-1">Reading queue</h2>
        <p className="muted mb-3 text-xs">Policy and SOP updates assigned after an edit — outstanding until marked read.</p>
        <ReadingQueue items={readingItems} canMark={canEditShifts} />
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
