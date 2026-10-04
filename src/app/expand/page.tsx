import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import TrainingClient from "./TrainingClient";
import { money } from "@/lib/format";

export default async function ExpandPage() {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [trainings, assignments, ideas, insights, completedTasks] = await Promise.all([
    prisma.trainingModule.findMany({
      where: { organizationId: orgId },
      include: {
        assignments: { include: { employee: { select: { name: true } } } },
        lessons: {
          orderBy: { sort: "asc" },
          include: {
            quiz: { select: { passingPct: true, questions: true } },
            progress: { select: { status: true, quizScore: true } },
          },
        },
      },
      orderBy: { category: "asc" },
    }),
    prisma.trainingAssignment.count({
      where: { employee: { organizationId: orgId }, status: "COMPLETED" },
    }),
    prisma.idea.findMany({
      where: { organizationId: orgId },
      orderBy: { status: "asc" },
    }),
    prisma.insight.findMany({
      where: { organizationId: orgId, type: { in: ["OPPORTUNITY", "REVENUE"] }, status: "OPEN" },
      orderBy: { impactValue: "desc" },
      take: 6,
    }),
    prisma.task.count({ where: { organizationId: orgId, status: "DONE" } }),
  ]);

  return (
    <AppShell crumb="Expand">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Expand</h1>
          <p className="muted mt-1">Growth: training built from your own knowledge, opportunities the data supports, and the effect of completed actions.</p>
        </div>

        {/* Growth opportunities */}
        <section className="grid gap-4 md:grid-cols-3">
          {insights.map((i) => (
            <div key={i.id} className="card card-hover p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge-green">{i.type}</span>
                {i.impactValue != null && (
                  <span className="ml-auto text-sm font-bold text-emerald-600">{money(i.impactValue)}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-navy-900 leading-snug">{i.title}</div>
              <p className="text-xs text-navy-500 mt-1.5">{i.summary}</p>
            </div>
          ))}
          {insights.length === 0 && <p className="muted">No open growth signals — check Understand for the latest scan.</p>}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Training */}
          <section className="card p-5">
            <h2 className="section-title mb-1">Training</h2>
            <p className="muted mb-4">Generated from your company's own knowledge — not generic courses. {assignments} assignment{assignments === 1 ? "" : "s"} completed.</p>
            <div className="space-y-3">
              {trainings.length > 0 ? (
                <TrainingClient
                  modules={trainings.map((t) => ({
                    id: t.id,
                    title: t.title,
                    category: t.category,
                    summary: t.summary,
                    content: t.content,
                    assignees: t.assignments.map((a) => a.employee.name),
                    lessons: t.lessons.map((l) => ({
                      id: l.id,
                      title: l.title,
                      sort: l.sort,
                      videoUrl: l.videoUrl,
                      videoKind: l.videoKind,
                      durationMin: l.durationMin,
                      content: l.content,
                      quiz: l.quiz
                        ? {
                            passingPct: l.quiz.passingPct,
                            questions: JSON.parse(l.quiz.questions),
                          }
                        : null,
                      progress: l.progress[0]
                        ? { status: l.progress[0].status, quizScore: l.progress[0].quizScore }
                        : null,
                    })),
                  }))}
                />
              ) : (
                <p className="muted">No training modules yet.</p>
              )}
            </div>
          </section>

          {/* Performance + Lab ideas */}
          <div className="space-y-6">
            <section className="card p-5">
              <h2 className="section-title mb-1">Performance improvement</h2>
              <p className="muted mb-3">How executed work connects to outcomes.</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{completedTasks}</div>
                  <div className="text-xs text-navy-500 mt-1">tasks completed</div>
                </div>
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{ideas.filter((i) => i.status === "EXPERIMENTING").length}</div>
                  <div className="text-xs text-navy-500 mt-1">experiments running</div>
                </div>
                <div className="rounded-xl bg-navy-50 p-4">
                  <div className="text-2xl font-bold text-navy-900">{ideas.filter((i) => i.status === "LAUNCHED" || i.status === "VALIDATED").length}</div>
                  <div className="text-xs text-navy-500 mt-1">validated / launched</div>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">From the Innovation Lab</h2>
                <a href="/lab" className="text-sm text-accent-blue hover:underline">Open Lab →</a>
              </div>
              <div className="space-y-2.5">
                {ideas.slice(0, 3).map((i) => (
                  <div key={i.id} className="rounded-xl border border-navy-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="badge-purple">{i.status}</span>
                      <span className="text-sm font-medium text-navy-900 truncate">{i.title}</span>
                    </div>
                    {i.nextStep && <div className="text-xs text-navy-500 mt-1">Next: {i.nextStep}</div>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
