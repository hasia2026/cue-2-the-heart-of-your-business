import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const recId = typeof body?.recId === "string" ? body.recId : null;
  const decision = body?.decision as "APPROVED" | "REJECTED" | "DEFERRED" | undefined;
  if (!recId || !decision || !["APPROVED", "REJECTED", "DEFERRED"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  const [rec] = await sql`select id, title, insight_id from recommendations where id = ${recId} and organization_id = ${session.organizationId}`;
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`
    update recommendations set status = ${decision}, decided_at = now(), decided_by = ${session.user.id}
    where id = ${recId}`;
  if (rec.insight_id && decision !== "DEFERRED") {
    await sql`update insights set status = ${decision === "REJECTED" ? "DISMISSED" : "ACTION_TAKEN"} where id = ${rec.insight_id}`;
  }
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: `RECOMMENDATION_${decision}`,
    targetType: "Recommendation",
    targetId: recId,
    detail: rec.title,
  });
  return NextResponse.json({ ok: true });
}
