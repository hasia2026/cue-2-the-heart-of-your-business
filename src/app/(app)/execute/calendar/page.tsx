import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";

export const dynamic = "force-dynamic";

type Appt = {
  id: string; title: string; kind: string; status: string; at: string; customer: string;
};
type DueTask = { id: string; title: string; priority: string; dueAt: string; status: string };

export default async function CalendarPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const [profile] = await sql`select timezone from business_profiles where organization_id = ${orgId}`;
  const tz = (profile?.timezone as string) || "America/Los_Angeles";

  const apptRows = await sql`
    select a.id, a.title, a.kind, a.status, a.scheduled_for as at, c.name as customer
    from appointments a join customers c on c.id = a.customer_id
    where a.organization_id = ${orgId}
      and a.scheduled_for >= now() - interval '1 day'
      and a.scheduled_for < now() + interval '30 days'
    order by a.scheduled_for asc`;
  const appts = apptRows as unknown as Appt[];

  const dueRows = await sql`
    select id, title, priority, due_at as "dueAt", status
    from tasks
    where organization_id = ${orgId} and due_at is not null and status <> 'DONE'
      and due_at < now() + interval '30 days'
    order by due_at asc`;
  const dueTasks = dueRows as unknown as DueTask[];

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayLabel = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const timeLabel = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const isOverdue = (d: Date) => d.getTime() < Date.now();

  const groups = new Map<string, Appt[]>();
  for (const a of appts) {
    const key = dayKey(new Date(a.at));
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const days = [...groups.keys()].sort();

  const kindTint = (kind: string) =>
    kind === "MEETING" ? "badge-purple" : kind === "DELIVERY" ? "badge-blue" : "badge-green";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Calendar</h1>
        <p className="page-sub">The next 30 days of visits and due tasks in the shop&apos;s own timezone ({tz}).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Scheduled visits</div><div className="kpi mt-1">{appts.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Task deadlines</div><div className="kpi mt-1">{dueTasks.length}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-widest text-navy-300">Overdue tasks</div><div className="kpi mt-1">{dueTasks.filter((t) => isOverdue(new Date(t.dueAt))).length}</div></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="section-title mb-3">Schedule</h2>
          <div className="space-y-3">
            {days.map((key) => (
              <div key={key} className="card p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-navy-300">{dayLabel(key)}</div>
                <div className="mt-2 space-y-2">
                  {(groups.get(key) ?? []).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2">
                      <span className="text-sm font-medium text-navy-100">{timeLabel(new Date(a.at))}</span>
                      <span className="text-sm text-navy-100">{a.title}</span>
                      <span className={`badge ${kindTint(a.kind)}`}>{a.kind.replace("_", " ")}</span>
                      <span className="text-xs text-navy-300">· {a.customer}</span>
                      {a.status !== "SCHEDULED" && <span className="badge-low ms-auto">{a.status}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {days.length === 0 && <div className="card p-6 muted">Nothing scheduled in the next 30 days.</div>}
          </div>
        </section>

        <section>
          <h2 className="section-title mb-3">Task deadlines</h2>
          <div className="space-y-2">
            {dueTasks.map((t) => (
              <div key={t.id} className="card flex flex-wrap items-center gap-2 p-3.5">
                <span className="min-w-0 flex-1 truncate text-sm text-navy-100">{t.title}</span>
                {isOverdue(new Date(t.dueAt)) && <span className="badge-red">overdue</span>}
                <span className={`badge ${t.priority === "HIGH" ? "badge-red" : "badge-low"}`}>{t.priority}</span>
                <span className="text-[11px] text-navy-300">{new Date(t.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}</span>
              </div>
            ))}
            {dueTasks.length === 0 && <div className="card p-6 muted">No task deadlines set. Add a due date on Execute → Projects.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
