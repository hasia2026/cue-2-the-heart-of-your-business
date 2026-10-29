// Shared import machinery: validation + DB-aware checks + transactional
// inserts for every import kind. Server actions (Next.js) call this with the
// session-derived org/actor; scripts can drive the SAME code path headlessly
// (scripts/verify-import.mts) because nothing here touches next/headers.
// The org scoping on every query is the tenant boundary — callers must have
// resolved orgId from a session, never from client input.
import { sql } from "./db";
import { logAudit } from "./audit";
import {
  fieldsFor,
  validateRow,
  validateRows,
  MAX_IMPORT_ROWS,
  type ImportKind,
  type Mapping,
  type CsvRow,
} from "./csv";

export type ImportIssue = { index: number; field: string | null; message: string };

export type ImportOptions = {
  /** Customer-name kinds (invoices + service orders + agreements): create a
   *  customer record for any customer name that doesn't exist yet, instead of
   *  blocking the row — work-order/billing/agreement exports then don't
   *  require a prior customers import. Within the file, the same name
   *  (case-insensitive) resolves to ONE newly created customer. */
  createMissingCustomers?: boolean;
  /** Validate only — no writes at all (preview steps run with this). */
  dryRun?: boolean;
  /** Row indexes the user explicitly chose to leave out (partial-import
   *  resolution in the preview step). Excluded rows are skipped even when
   *  valid: no customer gets auto-created for them, and they are counted in
   *  ImportResult.excludedUser instead of silently inflating `skipped`. */
  exclude?: number[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  customersCreated: number;
  /** Row-level problems (dry-run always carries them; commit carries them
   *  too so callers can explain what was skipped). */
  issues: ImportIssue[];
  /** Dry-run only: names (first-seen spelling) that WOULD get new customer
   *  records on a real commit. */
  customersToCreate: string[];
  /** Rows excluded by the user (partial-import resolution) — distinct from
   *  rows skipped for failing validation so the summary can say both. */
  excludedUser: number;
};

/** Kinds whose "customer" is a by-NAME reference resolved at insert time
 *  (invoices and both home-services targets) — they share the DB collision
 *  checks, the createMissingCustomers option and the insert-time resolution. */
export const CUSTOMER_NAME_KINDS: ImportKind[] = ["INVOICES", "SERVICE_ORDERS", "AGREEMENTS"];

const KINDS: ImportKind[] = ["CUSTOMERS", "VEHICLES", "INVOICES", "SERVICE_ORDERS", "AGREEMENTS"];

export function assertKind(kind: ImportKind) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown import type: ${kind}`);
}

/** Within-file duplicates — vehicles (stock) and invoices (number) share the
 *  "unique key column" shape. A duplicate row must be blocked in BOTH preview
 *  and commit or commit re-imports what preview warned about (the first
 *  IMP-TEST bug was this). */
function withinFileDupes(kind: ImportKind, mapping: Mapping, rows: CsvRow[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
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

/** DB-aware collision checks: existing stock numbers (vehicles), existing
 *  invoice numbers (invoices), and customer-name resolution (by-name kinds). */
export async function dbChecks(
  kind: ImportKind,
  orgId: string,
  mapping: Mapping,
  rows: CsvRow[],
  opts: ImportOptions = {},
): Promise<{ issues: ImportIssue[]; missingCustomers: string[] }> {
  const issues: ImportIssue[] = [];
  const missingCustomers: string[] = [];
  const col = (f: string): string | undefined => {
    if (!fieldsFor(kind).some((x) => x.name === f)) return undefined;
    return mapping[f];
  };
  if (kind === "VEHICLES") {
    const h = col("stock");
    if (!h) return { issues, missingCustomers };
    const stocks = [...new Set(rows.map((r) => (r[h] ?? "").trim().toUpperCase()).filter(Boolean))];
    if (!stocks.length) return { issues, missingCustomers };
    const existing = await sql`
      select stock_number from vehicles
      where organization_id = ${orgId} and upper(stock_number) = any(${stocks})`;
    const taken = new Set(
      (existing as unknown as { stock_number: string }[]).map((r) => r.stock_number.toUpperCase()),
    );
    rows.forEach((r, i) => {
      const s = (r[h] ?? "").trim().toUpperCase();
      if (s && taken.has(s)) {
        issues.push({ index: i, field: "stock", message: `Stock number ${s} already exists in your records` });
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
  }
  if (CUSTOMER_NAME_KINDS.includes(kind)) {
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
      // createMissingCustomers turns the blocker into a promise: the row
      // stays valid and the name is reported so the UI and the commit pass
      // create the customer record instead.
      const missingUniq = new Map<string, string>(); // lower → first-seen spelling
      rows.forEach((r, i) => {
        const n = (r[hCust] ?? "").trim();
        if (!n || found.has(n.toLowerCase())) return;
        if (opts.createMissingCustomers) {
          if (!missingUniq.has(n.toLowerCase())) missingUniq.set(n.toLowerCase(), n);
        } else {
          issues.push({ index: i, field: "customer", message: `Customer “${n}” is not in your records — import customers first, fix the spelling, or turn on “create missing customers”` });
        }
      });
      missingCustomers.push(...missingUniq.values());
    }
  }
  return { issues, missingCustomers };
}

/** Validate + (unless dryRun) insert inside one transaction. Rows that fail
 *  are skipped (counted, not thrown) so one bad row can't abort an
 *  otherwise-good 500-row import. */
export async function importRows(
  orgId: string,
  actorId: string | null,
  kind: ImportKind,
  mapping: Mapping,
  dataRows: CsvRow[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  assertKind(kind);

  // Same validation the preview ran — final authority before writes.
  const errors = validateRows(kind, mapping, dataRows);
  const { issues: dbIssues, missingCustomers } = await dbChecks(kind, orgId, mapping, dataRows, opts);
  errors.push(...withinFileDupes(kind, mapping, dataRows), ...dbIssues);
  const blocked = new Set(errors.map((e) => e.index));
  // User exclusions only touch rows the user saw and marked — out-of-range
  // indexes (stale preview) are ignored rather than trusted.
  const excluded = new Set(
    (opts.exclude ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < dataRows.length && !blocked.has(n)),
  );

  if (opts.dryRun) {
    return {
      imported: 0,
      skipped: blocked.size,
      customersCreated: 0,
      issues: errors,
      customersToCreate: opts.createMissingCustomers ? missingCustomers : [],
      excludedUser: excluded.size,
    };
  }

  let customersCreated = 0;
  let imported = 0;
  await sql.begin(async (tx) => {
    // With createMissingCustomers, work-order/billing/agreement exports don't
    // need a prior customers import: pre-create every distinct customer name
    // from the valid rows (existing customers are reused), then resolve by name.
    let custByName: Map<string, string> | null = null;
    if (CUSTOMER_NAME_KINDS.includes(kind) && opts.createMissingCustomers) {
      const names = new Set<string>();
      for (let i = 0; i < dataRows.length; i++) {
        if (blocked.has(i) || excluded.has(i)) continue;
        const v = validateRow(kind, mapping, dataRows[i]);
        if (v.ok) names.add(String(v.values.customer).trim().slice(0, 300));
      }
      custByName = new Map();
      if (names.size) {
        const existing = await tx`
          select id, name from customers
          where organization_id = ${orgId} and lower(name) = any(${[...names].map((n) => n.toLowerCase())})`;
        for (const c of existing as unknown as { id: string; name: string }[]) custByName.set(c.name.toLowerCase(), c.id);
        for (const n of names) {
          if (custByName.has(n.toLowerCase())) continue;
          const [c] = await tx`
            insert into customers (organization_id, name) values (${orgId}, ${n}) returning id`;
          custByName.set(n.toLowerCase(), (c as unknown as { id: string }).id);
          customersCreated += 1;
        }
      }
    }

    for (let i = 0; i < dataRows.length; i++) {
      if (blocked.has(i) || excluded.has(i)) continue;
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
          imported += 1;
        } catch {
          // Concurrent import inserted the same stock number first — skip.
        }
      } else if (kind === "CUSTOMERS") {
        try {
          await tx`
            insert into customers (organization_id, name, email, phone, type, address, notes)
            values (${orgId}, ${vals.name}, ${vals.email ?? null}, ${vals.phone ?? null},
              ${vals.type ?? "RETAIL"}, ${vals.address ?? null}, ${vals.notes ?? null})`;
          imported += 1;
        } catch {
          // Best-effort skip on any constraint race; idempotency comes from preview.
        }
      } else if (CUSTOMER_NAME_KINDS.includes(kind)) {
        // Customer is by-name — resolve (case-insensitive) inside the same tx.
        // The createMissingCustomers pass above has priority when it ran.
        const [cust] = custByName
          ? [{ id: custByName.get(String(vals.customer).trim().toLowerCase()) }]
          : await tx`
              select id from customers where organization_id = ${orgId} and lower(name) = lower(${String(vals.customer)}) limit 1`;
        if (!cust?.id) continue;
        if (kind === "INVOICES") {
          try {
            await tx`
              insert into invoices (organization_id, customer_id, number, kind, status, amount, issued_at, due_at)
              values (${orgId}, ${cust.id}, ${vals.number}, ${vals.kind ?? "DEAL"}, ${vals.status ?? "SENT"},
                ${vals.amount}, ${vals.issued_at ? new Date(String(vals.issued_at)) : null},
                ${vals.due_at ? new Date(String(vals.due_at)) : null})`;
            imported += 1;
          } catch {
            // Race on invoice number — skip like vehicles.
          }
        } else if (kind === "SERVICE_ORDERS") {
          await tx`
            insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, completed_at)
            values (${orgId}, ${cust.id}, ${vals.title}, ${vals.status ?? "OPEN"}, ${vals.amount ?? 0},
              ${vals.opened_at ? new Date(String(vals.opened_at)) : new Date()},
              ${vals.completed_at ? new Date(String(vals.completed_at)) : null})`;
          imported += 1;
        } else if (kind === "AGREEMENTS") {
          // One live agreement per customer (partial unique index). The skip
          // is deliberate: check inside the tx BEFORE inserting. A unique
          // violation must not be allowed to happen-and-catch here —
          // postgres.js transactions surface those as unhandled async errors
          // (observed as a 23505 escaping the try/catch and aborting the
          // whole import), so the happy path avoids the conflict entirely.
          if (String(vals.status ?? "ACTIVE").toUpperCase() === "ACTIVE") {
            const [live] = await tx`
              select id from maintenance_agreements
              where organization_id = ${orgId} and customer_id = ${cust.id} and status = 'ACTIVE' limit 1`;
            if (live) continue; // customer already has a live plan — skip row
          }
          try {
            await tx`
              insert into maintenance_agreements
                (organization_id, customer_id, plan_name, annual_value, starts_at, ends_at, status, notes)
              values (${orgId}, ${cust.id}, ${vals.plan_name ?? "Standard maintenance plan"},
                ${vals.annual_value ?? 0}, ${vals.starts_at ? new Date(String(vals.starts_at)) : new Date()},
                ${vals.ends_at ? new Date(String(vals.ends_at)) : null}, ${vals.status ?? "ACTIVE"},
                ${vals.notes ?? null})`;
            imported += 1;
          } catch {
            // Concurrent import inserted the same live plan first — skip.
          }
        }
      }
    }
  });

  if (actorId) {
    await logAudit({
      organizationId: orgId,
      actorId,
      action: "CSV_IMPORT",
      detail:
        customersCreated > 0
          ? `Imported ${imported} ${kind.toLowerCase()} record(s) from CSV, created ${customersCreated} customer(s)`
          : `Imported ${imported} ${kind.toLowerCase()} record(s) from CSV`,
      metadata: { kind, imported, customersCreated, requested: dataRows.length },
    });
  }

  return { imported, skipped: blocked.size, customersCreated, issues: errors, customersToCreate: [], excludedUser: excluded.size };
}
