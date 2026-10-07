"use server";

import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

// Sends a Pricing Studio decision to Execute as a PENDING recommendation.
// A manager approves or rejects it there; approval feeds the existing
// recommendation → workflow → tasks pipeline.
export async function requestPriceApproval(fd: FormData): Promise<void> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  const action = String(fd.get("action") ?? "").trim().slice(0, 1000);
  const rationale = String(fd.get("rationale") ?? "").trim().slice(0, 2000);
  const impact = Number(fd.get("impact") ?? NaN);
  if (!title || !action || !rationale) return;

  await sql`
    insert into recommendations (organization_id, title, action, rationale, impact_value, status, confidence)
    values (${orgId}, ${title}, ${action}, ${rationale},
      ${Number.isFinite(impact) && impact > 0 ? impact : null}, 'PENDING', 0.9)`;
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "PRICE_APPROVAL_REQUESTED",
    targetType: "Recommendation",
    detail: title,
  });
  revalidatePath("/execute");
  revalidatePath("/enhance");
}
