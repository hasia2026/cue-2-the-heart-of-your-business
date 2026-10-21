"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Back-gross entry — the F&I / warranty / GAP leg of the desking
// profitometer. Managers set it per deal right on the Pipeline board;
// OWNER/ADMIN/MANAGER can edit, MEMBER is blocked.

export async function setDealBackGross(
  dealId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Members can't set deal gross." };
  }
  const [deal] = await sql`
    select id, back_gross from deals where id = ${dealId} and organization_id = ${session.organizationId}`;
  if (!deal) return { ok: false, error: "Deal not in your organization." };
  const value = Math.max(0, Math.round(Number(amount) || 0));
  await sql`update deals set back_gross = ${value} where id = ${deal.id}`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "DEAL_BACK_GROSS_SET",
    targetType: "Deal",
    targetId: deal.id,
    detail: `back gross ${Number(deal.back_gross).toLocaleString()} → ${value.toLocaleString()}`,
  });
  revalidatePath("/pipeline");
  return { ok: true };
}
