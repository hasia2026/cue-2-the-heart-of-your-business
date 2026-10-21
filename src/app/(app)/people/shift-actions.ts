"use server";

import { sql } from "@/lib/db";
import { requireSessionAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { SHIFTS } from "./shift-shared";
import type { Cell } from "./ShiftGrid";

export type ShiftEntry = { employeeId: string; day: number; shift: Cell["shift"] };

/** Save the whole edited week. Org is taken from the session — talent never
 *  touches another store's roster; Members are read-only and rejected here. */
export async function saveShifts(entries: ShiftEntry[]): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") {
    return { ok: false, error: "Only owners, admins and managers can edit the schedule." };
  }
  if (!entries.length) return { ok: true };

  for (const e of entries) {
    if (!Number.isInteger(e.day) || e.day < 0 || e.day > 6) {
      return { ok: false, error: "Invalid day." };
    }
    if (!SHIFTS.includes(e.shift)) {
      return { ok: false, error: "Invalid shift." };
    }
  }

  // Scope every write by the session org AND the employee's org — an ID from
  // another store must resolve to nothing, never write.
  for (const e of entries) {
    const [owned] = await sql`
      select 1 from employees
      where id = ${e.employeeId} and organization_id = ${session.organizationId}`;
    if (!owned) return { ok: false, error: "Employee not in your organization." };
    await sql`
      insert into employee_shifts (organization_id, employee_id, day_of_week, shift)
      values (${session.organizationId}, ${e.employeeId}, ${e.day}, ${e.shift})
      on conflict (employee_id, day_of_week) do update set shift = excluded.shift`;
  }

  await logAudit({
    organizationId: session.organizationId,
    action: "SHIFTS_UPDATED",
    detail: `${entries.length} standing shift${entries.length === 1 ? "" : "s"} updated`,
    metadata: { entries: entries.map((e) => ({ day: e.day, shift: e.shift })) },
  });
  revalidatePath("/people");
  return { ok: true };
}
