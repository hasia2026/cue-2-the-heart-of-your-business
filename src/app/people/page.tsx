import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ComplianceClient from "./ComplianceClient";

export default async function PeoplePage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [employees, departments, assignments, policyDocs, acks] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: orgId },
      include: {
        department: true,
        manager: { select: { name: true } },
        tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } },
        assignments: { include: { training: { select: { title: true, category: true } } } },
      },
      orderBy: [{ departmentId: "asc" }, { name: "asc" }],
    }),
    prisma.department.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.trainingAssignment.findMany({
      where: { employee: { organizationId: orgId } },
      include: { employee: { select: { name: true } }, training: { select: { title: true, category: true } } },
      orderBy: { status: "asc" },
    }),
    prisma.document.findMany({
      where: { organizationId: orgId, kind: { in: ["POLICY", "PROCEDURE"] } },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, title: true, kind: true, uploadedAt: true },
    }),
    prisma.policyAcknowledgment.findMany({
      where: { organizationId: orgId },
      include: { employee: { select: { id: true, name: true } } },
    }),
  ]);

  const leaders = employees.filter((e) => !e.managerId);
  const byDept = departments.map((d) => ({
    dept: d,
    people: employees.filter((e) => e.departmentId === d.id),
  }));
  const unassigned = employees.filter((e) => !e.departmentId);

  return (
    <AppShell crumb="People">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">People</h1>
          <p className="muted mt-1">
            {employees.length} people · {departments.length} departments. CUE connects roles → responsibilities → training → tasks → outcomes.
          </p>
        </div>

        {/* Departments */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byDept.map(({ dept, people }) => (
            <div key={dept.id} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-navy-900">{dept.name}</h2>
                <span className="badge-blue">{people.length}</span>
              </div>
              {dept.description && <p className="text-xs text-navy-400 mb-3">{dept.description}</p>}
              <div className="space-y-2.5">
                {people.map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue/80 to-accent-purple/80 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                      {e.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-navy-900 leading-tight">{e.name}</div>
                      <div className="text-xs text-navy-500">{e.title}</div>
                      {e.responsibilities && (
                        <div className="text-[11px] text-navy-400 mt-0.5 line-clamp-2">{e.responsibilities}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {e.tasks.length > 0 && <span className="badge-low">{e.tasks.length} open task{e.tasks.length === 1 ? "" : "s"}</span>}
                        {e.manager && <span className="badge-low">reports to {e.manager.name.split(" ")[0]}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-navy-900 mb-2">No department</h2>
              {unassigned.map((e) => (
                <div key={e.id} className="text-sm text-navy-700">{e.name} — {e.title}</div>
              ))}
            </div>
          )}
        </section>

        {/* Compliance pack */}
        <ComplianceClient
          policyDocs={policyDocs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, uploadedAt: d.uploadedAt.toISOString() }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name, title: e.title }))}
          acknowledgments={acks.map((a) => ({
            documentId: a.documentId,
            employeeId: a.employeeId,
            employeeName: a.employee.name,
            acknowledgedAt: a.acknowledgedAt.toISOString(),
            signature: a.signature,
          }))}
        />

        {/* Skills & training */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="section-title mb-3">Skills on record</h2>
            <div className="space-y-2.5">
              {employees.filter((e) => e.skills).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-navy-800 w-36 shrink-0">{e.name}</span>
                  {e.skills?.split(",").map((s) => (
                    <span key={s} className="badge-low">{s.trim()}</span>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title mb-3">Training assignments</h2>
            <div className="space-y-2.5">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-navy-100 px-4 py-3">
                  <span className={a.status === "COMPLETED" ? "badge-green" : a.status === "IN_PROGRESS" ? "badge-blue" : "badge-medium"}>{a.status.replace("_", " ")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-navy-900 truncate">{a.training.title}</div>
                    <div className="text-xs text-navy-400">{a.employee.name} · {a.training.category}</div>
                  </div>
                </div>
              ))}
              {assignments.length === 0 && <p className="muted">No training assigned yet — generated modules appear in Expand.</p>}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
