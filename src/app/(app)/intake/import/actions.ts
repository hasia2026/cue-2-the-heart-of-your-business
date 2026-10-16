"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  parseCsv,
  guessMapping,
  validateRows,
  validateRow,
  fieldsFor,
  MAX_IMPORT_ROWS,
  type ImportKind,
  type Mapping,
  type CsvRow,
} from "@/lib/csv";

// CSV importer — drops a real DMS/plate-list export into CUE's structured
// records. Three actions, one validation core:
//   csvParse    — parse + headers + guessed mapping (no validation, no writes)
//   csvPreview  — full validation + DB-collision checks, writes nothing
//   csvCommit   — re-validate inside a transaction, then insert + audit
// The org scoping on every query is the tenant boundary; membership was
// already checked by requireSessionAction.

export type CsvIssue = { index: number; field: string | null; message: string };

export type FieldCol = { name: string; label: string; required?: boolean; options?: string[] };

export type CsvParse = {
  headers: string[];
  mapping: Mapping;
  total: number;
  truncated: boolean;
  fields: FieldCol[];
};

// Within-file duplicates — vehicles (stock) and invoices (number) share the
// "unique key column" shape. Extracted so commit re-runs the exact same
// check preview did; a duplicate row must be blocked in BOTH paths or commit
// re-imports what preview warned about (the first IMP-TEST bug was this).
function withinFileDupes(kind: ImportKind, mapping: Mapping, rows: CsvRow[]): CsvIssue[] {
  const issues: CsvIssue[] = [];
  const keyField = kind === "VEHICLES" ? "stock" : kind === "INVOICES" ? "number" : null;
  if (!keyField) return issues;
  const h = mapping[keyField];
  if (!h) return issues;
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const v = (row[h] ?? "").trim().toUpperCase();
    if (!v) return;
    if (seen.has(v)) {
      issues.push({
        index: i,
        field: keyField,
        message: `Duplicate in file — ${keyField === "stock" ? "stock number" : "invoice number"} ${v} also appears on row ${(seen.get(v) ?? 0) + 1}`,
      });
    } else {
      seen.set(v, i);
    }
  });
  return issues;
}

const KINDS: ImportKind[] = ["CUSTOMERS", "VEHICLES", "INVOICES"];

function assertKind(kind: ImportKind) {
  if (!KINDS.includes(kind)) throw new Error("Unknown import type");
}

function parseFile(kind: ImportKind, csv: string): { headers: string[]; rows: CsvRow[] } {
  if (typeof csv !== "string" || csv.length > 2_000_000) {
    throw new Error("Import file is too large — keep it under 2 MB.");
  }
  assertKind(kind);
  const { headers, rows } = parseCsv(csv);
  return { headers, rows: rows.slice(0, MAX_IMPORT_ROWS) };
}

/** Step 1: parse the file and hand back headers + a guessed mapping.
 *  No validation yet — the user hasn't confirmed the mapping. */
export async function csvParseAction(kind: ImportKind, csv: string): Promise<CsvParse> {
  await requireSessionAction();
  const { headers, rows } = parseFile(kind, csv);
  return {
    headers: headers.slice(0, 60),
    mapping: guessMapping(kind, headers),
    total: rows.length,
    truncated: parseCsv(csv).rows.length > MAX_IMPORT_ROWS,
    fields: fieldsFor(kind).map((f) => ({ name: f.name, label: f.label, required: f.required, options: [...(f.options ?? [])] })),
  };
}

/** Step 2: full validation with the confirmed mapping, plus the DB-aware
 *  checks (duplicate stock/invoice numbers in this org, customer lookups,
 *  within-file duplicates). Writes nothing. */
export async function csvPreviewAction(
  kind: ImportKind,
  csv: string,
  mapping: Mapping,
): Promise<CsvPreview> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const { headers, rows } = parseFile(kind, csv);
  const dataRows = rows.slice(0, MAX_IMPORT_ROWS);

  // Value-level problems (missing required, bad numbers/dates/enums).
  const errors = validateRows(kind, mapping, dataRows);

  errors.push(
    ...withinFileDupes(kind, mapping, dataRows),
    ...(await dbChecks(kind, orgId, mapping, dataRows)),
  );

  const blocked = new Set(errors.map((e) => e.index));
  return {
    headers: headers.slice(0, 60),
    mapping,
    total: dataRows.length,
    truncated: parseCsv(csv).rows.length > MAX_IMPORT_ROWS,
    fields: fieldsFor(kind).map((f) => ({ name: f.name, label: f.label, required: f.required, options: [...(f.options ?? [])] })),
    errors,
    valid: dataRows.filter((_, i) => !blocked.has(i)).length,
    blocked: blocked.size,
  };
}

export type CsvPreview = CsvParse & { errors: CsvIssue[]; valid: number; blocked: number };
export type CsvCommit = { imported: number; skipped: number };

/** Step 3: re-validate inside a transaction, then insert the valid rows.
 *  Rows that fail are skipped (counted, not thrown) so one bad row can't
 *  abort an otherwise-good 500-row import. */
export async function csvCommitAction(
  kind: ImportKind,
  csv: string,
  mapping: Mapping,
): Promise<CsvCommit> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only Owners, Admins and Managers can import data.");
  const orgId = session.organizationId;
  const { rows } = parseFile(kind, csv);

  // Same validation the preview ran — final authority before writes.
  const dataRows = rows.slice(0, MAX_IMPORT_ROWS);
  const errors = validateRows(kind, mapping, dataRows);
  errors.push(...withinFileDupes(kind, mapping, dataRows), ...(await dbChecks(kind, orgId, mapping, dataRows)));
  const blocked = new Set(errors.map((e) => e.index));

  const imported = await sql.begin(async (tx) => {
    let count = 0;
    for (let i = 0; i < dataRows.length; i++) {
      if (blocked.has(i)) continue;
      const row = dataRows[i];
      const v = validateRow(kind, mapping, row);
      if (!v.ok) continue; // raced state — preview was fresher; skip row
      const vals = v.values;
      if (kind === "VEHICLES") {
        try {
          await tx`
            insert into vehicles (organization_id, stock_number, vin, year, make, model, trim, kind, status, list_price, cost, listed_at)
            values (${orgId}, ${vals.stock}, ${vals.vin ?? null}, ${vals.year}, ${vals.make}, ${vals.model},
              ${vals.trim ?? null}, ${vals.kind ?? "USED"}, ${vals.status ?? "AVAILABLE"},
              ${vals.list_price ?? null}, ${vals.cost ?? null}, ${vals.listed_at ? new Date(String(vals.listed_at)) : null})`;
          count += 1;
        } catch {
          // Concurrent import inserted the same stock number first — skip.
        }
      } else if (kind === "CUSTOMERS") {
        try {
          await tx`
            insert into customers (organization_id, name, email, phone, type, address, notes)
            values (${orgId}, ${vals.name}, ${vals.email ?? null}, ${vals.phone ?? null},
              ${vals.type ?? "RETAIL"}, ${vals.address ?? null}, ${vals.notes ?? null})`;
          count += 1;
        } catch {
          // Best-effort skip on any constraint race; idempotency comes from preview.
        }
      } else if (kind === "INVOICES") {
        // Customer is by-name — resolve (case-insensitive) inside the same tx.
        const [cust] = await tx`
          select id from customers where organization_id = ${orgId} and lower(name) = lower(${String(vals.customer)}) limit 1`;
        if (!cust) continue;
        try {
          await tx`
            insert into invoices (organization_id, customer_id, number, kind, status, amount, issued_at, due_at)
            values (${orgId}, ${cust.id}, ${vals.number}, ${vals.kind ?? "DEAL"}, ${vals.status ?? "SENT"},
              ${vals.amount}, ${vals.issued_at ? new Date(String(vals.issued_at)) : null},
              ${vals.due_at ? new Date(String(vals.due_at)) : null})`;
          count += 1;
        } catch {
          // Race on invoice number — skip like vehicles.
        }
      }
    }
    return count;
  });

  await logAudit({
    organizationId: orgId,
    actorId: session.user.id,
    action: "CSV_IMPORT",
    detail: `Imported ${imported} ${kind.toLowerCase()} record(s) from CSV`,
    metadata: { kind, imported, requested: rows.length },
  });

  // Intake checklist marks the import step done on the first successful import.
  const patch = { csvImport: { done: imported > 0, at: new Date().toISOString(), kind, count: imported } };
  try {
    await sql`
      update business_profiles
      set intake_state = intake_state || ${sql.json(patch)}
      where organization_id = ${orgId}`;
  } catch (e) {
    console.error("intake_state update failed", e);
  }

  revalidatePath("/intake");
  revalidatePath("/capture");
  revalidatePath("/intake/import");
  return { imported, skipped: blocked.size };
}

/** DB-aware collision checks: existing stock numbers (vehicles), existing
 *  invoice numbers (invoices), and customer-name resolution (invoices). */
async function dbChecks(
  kind: ImportKind,
  orgId: string,
  mapping: Mapping,
  rows: CsvRow[],
): Promise<CsvIssue[]> {
  const issues: CsvIssue[] = [];
  const col = (f: string): string | undefined => {
    if (!fieldsFor(kind).some((x) => x.name === f)) return undefined;
    return mapping[f];
  };
  if (kind === "VEHICLES") {
    const h = col("stock");
    if (!h) return issues;
    const stocks = [...new Set(rows.map((r) => (r[h] ?? "").trim().toUpperCase()).filter(Boolean))];
    if (!stocks.length) return issues;
    const existing = await sql`
      select stock_number from vehicles
      where organization_id = ${orgId} and upper(stock_number) = any(${stocks})`;
    const taken = new Set(
      (existing as unknown as { stock_number: string }[]).map((r) => r.stock_number.toUpperCase()),
    );
    rows.forEach((r, i) => {
      const s = (r[h] ?? "").trim().toUpperCase();
      if (s && taken.has(s)) {
        issues.push({ index: i, field: "stock", message: `Stock number ${s} already exists in your vehicles` });
      }
    });
  }
  if (kind === "INVOICES") {
    const hNum = col("number");
    if (hNum) {
      const nums = [...new Set(rows.map((r) => (r[hNum] ?? "").trim()).filter(Boolean))];
      if (nums.length) {
        const existing = await sql`
          select number from invoices where organization_id = ${orgId} and number = any(${nums})`;
        const taken = new Set(
          (existing as unknown as { number: string }[]).map((r) => String(r.number)),
        );
        rows.forEach((r, i) => {
          const n = (r[hNum] ?? "").trim();
          if (n && taken.has(n)) {
            issues.push({ index: i, field: "number", message: `Invoice number ${n} already exists in your records` });
          }
        });
      }
    }
    const hCust = col("customer");
    if (hCust) {
      const names = [...new Set(rows.map((r) => (r[hCust] ?? "").trim()).filter(Boolean))];
      const found = new Set<string>();
      if (names.length) {
        const existing = await sql`
          select name from customers
          where organization_id = ${orgId} and lower(name) = any(${names.map((n) => n.toLowerCase())})`;
        for (const c of existing as unknown as { name: string }[]) found.add(c.name.toLowerCase());
      }
      rows.forEach((r, i) => {
        const n = (r[hCust] ?? "").trim();
        if (n && !found.has(n.toLowerCase())) {
          issues.push({ index: i, field: "customer", message: `Customer “${n}” is not in your records — import customers first or fix the spelling` });
        }
      });
    }
  }
  return issues;
}
