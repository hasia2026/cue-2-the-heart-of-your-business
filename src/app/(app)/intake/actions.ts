"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { MOCK_SHEET } from "./mock-sheet";
import { HVAC_SHEET } from "./hvac-sheet";
import { REPAIR_SHEET } from "./repair-sheet";
import { SALON_SHEET } from "./salon-sheet";

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

// Home-services intake — the same teaching loop with a field-service work
// order instead of a trade-in lot sheet. A correct run creates a REAL service
// call (clearly prefixed MOCK-) so the shop sees where a real export lands.

export type HvacMockHints = Partial<
  Record<"job" | "equipment" | "laborHours" | "permit" | "quoted" | "flow", string>
>;

export async function submitMockServiceCall(
  formData: FormData,
): Promise<{ ok: boolean; job?: string; hints?: HvacMockHints }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const [profile] = await sql`select intake_state from business_profiles where organization_id = ${orgId}`;
  const already = (profile?.intake_state as Record<string, unknown> | null)?.mockServiceCall;
  if (already) return { ok: true, job: typeof already === "object" ? (already as { job?: string }).job : undefined };

  const job = String(formData.get("job") ?? "").trim().toUpperCase();
  const equipment = money(formData.get("equipment"));
  const permit = money(formData.get("permit"));
  const quoted = money(formData.get("quoted"));
  const laborHours = Number(String(formData.get("laborHours") ?? "").trim());
  const flow = String(formData.get("flow") ?? "");

  const hints: HvacMockHints = {};
  if (job !== HVAC_SHEET.job) hints.job = "The job number is on the “Job:” line, right next to the customer name.";
  if (equipment !== HVAC_SHEET.equipment) hints.equipment = "Equipment cost is its own labeled line — the equipment only, no labor or permit.";
  if (laborHours !== HVAC_SHEET.laborHours) hints.laborHours = "Labor is on the “Labor:” line — read the hours, not the hourly rate.";
  if (permit !== HVAC_SHEET.permit) hints.permit = "Permit + haul-away is its own labeled line.";
  if (quoted !== HVAC_SHEET.quoted) hints.quoted = "The quoted total is the last dollar figure on the sheet.";
  if (flow !== "record") hints.flow = "A completed install sheet should become a structured service call CUE can query — that's what makes it worth more than a photo.";

  if (Object.keys(hints).length) {
    return { ok: false, hints };
  }

  const storedJob = `MOCK-${job}`;
  try {
    const [customer] = await sql`
      insert into customers (organization_id, name, address, notes)
      values (${orgId}, 'MOCK — Nguyen Residence', ${HVAC_SHEET.site}, 'Created by the intake mock exercise')
      returning id`;
    await sql`
      insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, service_type, scope, property_address)
      values (${orgId}, ${customer.id}, ${`MOCK — Heat pump + furnace replacement (${storedJob})`}, 'OPEN',
              ${quoted}, now(), 'INSTALL', ${HVAC_SHEET.system}, ${HVAC_SHEET.site})`;
  } catch {
    // Duplicate run in a race with itself — treat as complete.
  }

  const patch = { mockServiceCall: { done: true, at: new Date().toISOString(), job: storedJob } };
  await sql`
    update business_profiles
    set intake_state = intake_state || ${sql.json(patch)}
    where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "INTAKE_MOCK_COMPLETED",
    detail: `Mock install work order passed — ${HVAC_SHEET.system} recorded as ${storedJob}`,
    metadata: { sheet: HVAC_SHEET.sheetId, job: storedJob },
  });

  revalidatePath("/intake");
  return { ok: true, job: storedJob };
}

// Independent auto-repair intake — the same teaching loop with a repair order
// instead of an install work order or a trade-in lot sheet. A correct run
// creates a REAL repair order (clearly prefixed MOCK-).

export type RepairMockHints = Partial<Record<"ro" | "parts" | "laborHours" | "quoted" | "flow", string>>;

export async function submitMockRepairOrder(
  formData: FormData,
): Promise<{ ok: boolean; ro?: string; hints?: RepairMockHints }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const [profile] = await sql`select intake_state from business_profiles where organization_id = ${orgId}`;
  const already = (profile?.intake_state as Record<string, unknown> | null)?.mockRepairOrder;
  if (already) return { ok: true, ro: typeof already === "object" ? (already as { ro?: string }).ro : undefined };

  const ro = String(formData.get("ro") ?? "").trim().toUpperCase();
  const parts = money(formData.get("parts"));
  const quoted = money(formData.get("quoted"));
  const laborHours = Number(String(formData.get("laborHours") ?? "").trim());
  const flow = String(formData.get("flow") ?? "");

  const hints: RepairMockHints = {};
  if (ro !== REPAIR_SHEET.ro) hints.ro = "The RO number is on the “RO:” line, right before the customer name.";
  if (parts !== REPAIR_SHEET.parts) hints.parts = "Parts cost is its own labeled line — parts only, no labor or tax.";
  if (laborHours !== REPAIR_SHEET.laborHours) hints.laborHours = "Labor is on the “Labor:” line — read the hours, not the hourly rate.";
  if (quoted !== REPAIR_SHEET.quoted) hints.quoted = "The quoted total is the last dollar figure on the sheet.";
  if (flow !== "record") hints.flow = "A completed repair order should become a structured record CUE can query — that's what makes it billable.";

  if (Object.keys(hints).length) return { ok: false, hints };

  const storedRo = `MOCK-RO-${ro}`;
  try {
    const [customer] = await sql`
      insert into customers (organization_id, name, address, notes)
      values (${orgId}, 'MOCK — Alvarez (repair intake)', 'Costa Mesa, CA', 'Created by the intake mock exercise')
      returning id`;
    await sql`
      insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, service_type, scope)
      values (${orgId}, ${customer.id}, ${`MOCK — Front brakes (${storedRo})`}, 'OPEN',
              ${quoted}, now(), 'REPAIR', ${REPAIR_SHEET.concern})`;
  } catch {
    // Duplicate run in a race with itself — treat as complete.
  }

  const patch = { mockRepairOrder: { done: true, at: new Date().toISOString(), ro: storedRo } };
  await sql`
    update business_profiles
    set intake_state = intake_state || ${sql.json(patch)}
    where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "INTAKE_MOCK_COMPLETED",
    detail: `Mock repair order passed — ${REPAIR_SHEET.vehicle} recorded as ${storedRo}`,
    metadata: { sheet: REPAIR_SHEET.sheetId, ro: storedRo },
  });

  revalidatePath("/intake");
  return { ok: true, ro: storedRo };
}

// Salon intake — the same teaching loop with a closed service ticket and the
// rebooking that should follow it. A correct run creates a REAL service ticket
// (prefixed MOCK-) plus the 3-week rebooking appointment.

export type SalonMockHints = Partial<
  Record<"ticket" | "servicePrice" | "retailPrice" | "rebookWeeks" | "flow", string>
>;

export async function submitMockSalonTicket(
  formData: FormData,
): Promise<{ ok: boolean; ticket?: string; hints?: SalonMockHints }> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;

  const [profile] = await sql`select intake_state from business_profiles where organization_id = ${orgId}`;
  const already = (profile?.intake_state as Record<string, unknown> | null)?.mockSalonTicket;
  if (already) return { ok: true, ticket: typeof already === "object" ? (already as { ticket?: string }).ticket : undefined };

  const ticket = String(formData.get("ticket") ?? "").trim().toUpperCase();
  const servicePrice = money(formData.get("servicePrice"));
  const retailPrice = money(formData.get("retailPrice"));
  const rebookWeeks = Number(String(formData.get("rebookWeeks") ?? "").trim());
  const flow = String(formData.get("flow") ?? "");

  const hints: SalonMockHints = {};
  if (ticket !== SALON_SHEET.ticket) hints.ticket = "The ticket number is on the “Ticket:” line, right before the client name.";
  if (servicePrice !== SALON_SHEET.servicePrice) hints.servicePrice = "Service price is its own labeled line — the service only, not the retail add-on.";
  if (retailPrice !== SALON_SHEET.retailPrice) hints.retailPrice = "Retail is the product line — read the product price, not the service price.";
  if (rebookWeeks !== SALON_SHEET.rebookWeeks) hints.rebookWeeks = "The sheet gives the rebooking cycle in weeks on the “Rebook:” line.";
  if (flow !== "record") hints.flow = "A closed service ticket should become a structured ticket with the next appointment booked — that's what makes the rebook stick.";

  if (Object.keys(hints).length) return { ok: false, hints };

  const storedTicket = `MOCK-ST-${ticket}`;
  try {
    const [customer] = await sql`
      insert into customers (organization_id, name, notes)
      values (${orgId}, 'MOCK — Chị Lan (salon intake)', 'Created by the intake mock exercise')
      returning id`;
    await sql`
      insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, service_type)
      values (${orgId}, ${customer.id}, ${`MOCK — ${SALON_SHEET.service} (${storedTicket})`}, 'OPEN',
              ${SALON_SHEET.total}, now(), 'SALON')`;
    await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status, notes)
      values (${orgId}, ${customer.id}, ${`Rebook — ${SALON_SHEET.service} (${storedTicket})`}, 'SERVICE',
              now() + interval '3 weeks', 'SCHEDULED', 'Rebooking created by the intake mock exercise')`;
  } catch {
    // Duplicate run in a race with itself — treat as complete.
  }

  const patch = { mockSalonTicket: { done: true, at: new Date().toISOString(), ticket: storedTicket } };
  await sql`
    update business_profiles
    set intake_state = intake_state || ${sql.json(patch)}
    where organization_id = ${orgId}`;
  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "INTAKE_MOCK_COMPLETED",
    detail: `Mock service ticket passed — ${SALON_SHEET.service} recorded as ${storedTicket}`,
    metadata: { sheet: SALON_SHEET.sheetId, ticket: storedTicket },
  });

  revalidatePath("/intake");
  revalidatePath("/pipeline");
  return { ok: true, ticket: storedTicket };
}
