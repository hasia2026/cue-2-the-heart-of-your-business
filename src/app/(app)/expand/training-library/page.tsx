import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { getT } from "@/lib/locale";
import { LIBRARY_LABEL_KEYS, buildLabels } from "@/lib/i18nKeys";
import TrainingLibrary from "../TrainingLibrary";

export const dynamic = "force-dynamic";

export default async function TrainingLibraryPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const { t } = await getT();
  const orgId = session.organizationId;
  const canManage = session.role === "OWNER" || session.role === "ADMIN";

  const libRows = await sql`
    select m.id, m.title, m.summary, m.category, m.content_url as "contentUrl", m.content, m.quiz,
      (select count(*) from training_attempts a where a.module_id = m.id)::int as attempts,
      (select coalesce(round(avg(a.score::numeric / greatest(a.total, 1) * 100)), 0)::int from training_attempts a where a.module_id = m.id) as "avgScore",
      (select (a.score || ':' || a.total) from training_attempts a where a.module_id = m.id and a.user_id = ${session.user.id} order by a.created_at desc limit 1) as mine
    from training_modules m
    where m.organization_id = ${orgId} and m.source = 'IMPORTED'
    order by m.created_at desc`;
  const teamRows = await sql`
    select u.name, u.email, count(*)::int as attempts,
      coalesce(round(avg(a.score::numeric / greatest(a.total, 1) * 100)), 0)::int as "avgScore",
      max(a.created_at)::text as "lastAt"
    from training_attempts a join users u on u.id = a.user_id
    where a.organization_id = ${orgId}
    group by u.name, u.email
    order by "avgScore" desc nulls last`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/expand" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Expand</Link>
        <h1 className="page-title mt-2">Training Library</h1>
        <p className="page-sub">Imported playbooks, quizzes, and team results — the source material behind consistent delivery.</p>
      </div>

      <TrainingLibrary
        labels={buildLabels(LIBRARY_LABEL_KEYS, t)}
        canImport={canManage}
        canManage={canManage}
        team={teamRows.map((r) => ({ name: r.name, email: r.email, attempts: r.attempts, avgScore: Number(r.avgScore), lastAt: r.lastAt }))}
        modules={libRows.map((m) => {
          const mine = typeof m.mine === "string" ? m.mine.split(":") : null;
          return {
            id: m.id, title: m.title, summary: m.summary, category: m.category,
            contentUrl: m.contentUrl, content: m.content,
            quiz: (m.quiz ?? []) as { q: string; choices: string[]; answer: number }[],
            attempts: m.attempts, avgScore: Number(m.avgScore),
            myScore: mine ? Number(mine[0]) : null,
            myTotal: mine ? Number(mine[1]) : null,
          };
        })}
      />
    </div>
  );
}
