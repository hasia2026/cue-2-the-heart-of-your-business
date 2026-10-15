"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { MOCK_SHEET } from "./mock-sheet";

// Dealership intake — mock appraisal exercise. A fictional lot sheet is
// shown in the UI; the user transcribes it into CUE exactly like they will
// with a real DMS/trade export. Deterministic fixture (see mock-sheet.ts);
// validation teaches accuracy — wrong numbers get a pointed hint, not a
// silent save. A correct run creates a REAL structured vehicle record
// (stock MOCK-…) so the user sees where the CSV importer will land rows later.

function money(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type MockHints = Partial<Record<"stock" | "year" | "make" | "allowance" | "recon" | "listPrice" | "flow", string>>;

export async function submitMockAppraisal(
  formData: FormData,
): Promise<{ ok: boolean; stock?: string; hints?: MockHints; error?: string }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  // Idempotent: second completion shouldn't mint another mock unit.
  const [profile] = await sql`select intake_state from business_profiles where organization_id = ${orgId}`;
  const already = (profile?.intake_state as Record<string, unknown> | null)?.mockAppraisal;
  if (already) return { ok: true, stock: typeof already === "object" ? (already as { stock?: string }).stock : undefined };

  const stock = String(formData.get("stock") ?? "").trim().toUpperCase();
  const year = Number(String(formData.get("year") ?? "").trim());
  const make = String(formData.get("make") ?? "").trim();
  const allowance = money(formData.get("allowance"));
  const recon = money(formData.get("recon"));
  const listPrice = money(formData.get("listPrice"));
  const flow = String(formData.get("flow") ?? "");

  const hints: MockHints = {};
  if (stock !== MOCK_SHEET.stock) hints.stock = "The stock number is top-left of the sheet, right after “Stock:”.";
  if (year !== MOCK_SHEET.year) hints.year = `Year is on the unit line right after the stock number — it's ${MOCK_SHEET.year}.`;
  if (!/^\s*ford\s*$/i.test(make)) hints.make = "The make is one word, also on the unit line right after the year.";
  if (allowance !== MOCK_SHEET.allowance) hints.allowance = "Trade-in allowance is the negotiated dollar figure — line 3 of the sheet (ignore the recon + list numbers).";
  if (recon !== MOCK_SHEET.recon) hints.recon = "Reconditioning estimate is its own labeled line — read the estimate total, not the line-item detail.";
  if (listPrice !== MOCK_SHEET.listPrice) hints.listPrice = "The sheet's recommended target list price is the last dollar figure on the unit line.";
  if (flow !== "record") hints.flow = "A trade-in appraisal should become a structured vehicle record CUE can query — that's what makes it worth more than a photo.";

  if (Object.keys(hints).length) {
    return { ok: false, hints };
  }

  const storedStock = `MOCK-${stock}`;
  try {
    await sql`
      insert into vehicles (organization_id, stock_number, year, make, model, trim, kind, status, list_price, cost, listed_at)
      values (${orgId}, ${storedStock}, ${MOCK_SHEET.year}, 'Ford', 'F-150', 'XLT SuperCrew (mock intake)', 'USED', 'RESERVED',
              ${listPrice}, ${allowance}, now())`;
  } catch {
    // Duplicate run in a race with itself — treat as complete.
  }
  // postgres.js double-encodes string params in a jsonb context and the
  // template types reject raw objects — sql.json() serializes properly on
  // both counts.
  const patch = { mockAppraisal: { done: true, at: new Date().toISOString(), stock: storedStock } };
  await sql`
    update business_profiles
    set intake_state = intake_state || ${sql.json(patch)}
    where organization_id = ${orgId}`;
  // Note: audit_events.target_id is a uuid column — the stock number goes in
  // detail/metadata, not targetId.
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "INTAKE_MOCK_COMPLETED",
    detail: `Mock appraisal exercise passed — ${MOCK_SHEET.year} ${MOCK_SHEET.make} ${MOCK_SHEET.model} recorded as ${storedStock}`,
    metadata: { sheet: MOCK_SHEET.sheetId, stock: storedStock },
  });

  revalidatePath("/intake");
  revalidatePath("/enhance");
  return { ok: true, stock: storedStock };
}
