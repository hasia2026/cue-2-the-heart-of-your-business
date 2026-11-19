import Link from "next/link";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function BrandStudioPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;

  const assets = await sql`
    select id, name, kind, description, status from brand_assets
    where organization_id = ${orgId} order by kind, name`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/enhance" className="text-xs font-semibold text-violet-300 hover:text-violet-200">← Enhance</Link>
        <h1 className="page-title mt-2">Brand Studio</h1>
        <p className="page-sub">Keep the voice, visuals, and proof points that make the business feel consistent everywhere.</p>
      </div>

      <section>
        <h2 className="section-title mb-3">Brand assets</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {assets.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{a.name}</span>
                <span className="badge-blue ms-auto">{a.kind}</span>
              </div>
              {a.description && <p className="muted mt-1 text-xs">{a.description}</p>}
            </div>
          ))}
          {assets.length === 0 && <div className="card p-5 muted">No brand assets yet.</div>}
        </div>
      </section>
    </div>
  );
}
