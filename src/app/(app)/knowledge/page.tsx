import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import SopRecorder from "./SopRecorder";

export const dynamic = "force-dynamic";

const CATEGORY_BADGE: Record<string, string> = {
  POLICY: "badge-blue", PROCEDURE: "badge-green", DECISION: "badge-purple",
  LESSON: "badge-orange", CUSTOMER: "badge-blue", PRODUCT: "badge-low",
  HISTORY: "badge-low", STRATEGY: "badge-purple",
};

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const items = query
    ? await sql`
        select id, title, content, category, tags, status, updated_at from knowledge_items
        where organization_id = ${orgId}
          and (title ilike ${"%" + query + "%"} or content ilike ${"%" + query + "%"} or coalesce(tags,'') ilike ${"%" + query + "%"})
        order by updated_at desc limit 50`
    : await sql`
        select id, title, content, category, tags, status, updated_at from knowledge_items
        where organization_id = ${orgId} order by updated_at desc limit 50`;

  const exampleQuestions = ["What is our discount authority?", "How fast must we invoice ROs?", "Who gets loaners?"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Knowledge</h1>
        <p className="page-sub">The company's institutional memory — searchable and sourced. Ask it things like “{exampleQuestions[0]}”</p>
      </div>

      <form className="flex gap-2" action="/knowledge">
        <input name="q" defaultValue={query} className="input" placeholder="Search policies, procedures, decisions, lessons…" />
        <button className="btn-primary">Search</button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {exampleQuestions.map((eq) => (
          <a key={eq} href={`/knowledge?q=${encodeURIComponent(eq.replace("What is our ", "").replace("?", ""))}`} className="badge-low hover:bg-white/[0.1]">
            {eq}
          </a>
        ))}
      </div>

      {/* Voice SOP prototype: record a walkthrough, CUE drafts the procedure. */}
      <SopRecorder />

      <section className="space-y-2.5">
        {items.map((k) => (
          <details key={k.id} className="card p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center gap-2">
                <span className={CATEGORY_BADGE[k.category] ?? "badge-low"}>{k.category}</span>
                <span className="font-semibold text-navy-100">{k.title}</span>
                <span className="badge-low ms-auto">{k.status}</span>
              </div>
              <p className="muted mt-1 line-clamp-2 text-xs">{k.content}</p>
            </summary>
            <div className="mt-3 border-t border-white/[0.06] pt-3 text-sm text-navy-100/90">{k.content}</div>
            {k.tags && <div className="mt-2 text-xs text-navy-300/70">Tags: {k.tags}</div>}
          </details>
        ))}
        {items.length === 0 && (
          <div className="card p-6 text-center muted">
            {query ? `Nothing matches “${query}”.` : "No knowledge yet — capture documents to build the memory."}
          </div>
        )}
      </section>
    </div>
  );
}
