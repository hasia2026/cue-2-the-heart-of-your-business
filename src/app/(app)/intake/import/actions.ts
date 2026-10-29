"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  parseCsv,
  guessMapping,
  fieldsFor,
  MAX_IMPORT_ROWS,
  type ImportKind,
  type Mapping,
} from "@/lib/csv";
import {
  importRows,
  assertKind,
  type ImportIssue,
  type ImportOptions,
} from "@/lib/import-db";
import {
  buildSuggestedOrder,
  suggestedOrderCsv,
  dismissSuggestedOrderItem,
  restoreSuggestedOrderItem,
  type SuggestedOrderCategory,
} from "@/lib/suggested-order";
import { getWorkspaceProfile } from "@/lib/workspace-profile";

// CSV importer — drops a real DMS/plate-list/service-board export into CUE's
// structured records. Four actions, one machinery core (src/lib/import-db.ts):
//   csvParseAction           — parse + headers + guessed mapping (no validation, no writes)
//   csvPreviewAction         — full validation + DB-collision checks (importRows dry-run)
//   csvCommitAction          — session + re-validate + insert + audit (importRows)
//   exportReconciliationAction — download an org's records back as CSV (read-only)
// The org scoping inside import-db uses the SESSION org id — never client input.

export type CsvIssue = ImportIssue;

export type FieldCol = { name: string; label: string; required?: boolean; options?: string[] };

export type CsvParse = {
  headers: string[];
  mapping: Mapping;
  total: number;
  truncated: boolean;
  fields: FieldCol[];
};

function parseFile(kind: ImportKind, csv: string): { headers: string[]; rows: ReturnType<typeof parseCsv>["rows"] } {
  if (typeof csv !== "string" || csv.length > 2_000_000) {
    throw new Error("Import file is too large — keep it under 2 MB.");
  }
  assertKind(kind);
  const { headers, rows } = parseCsv(csv);
  return { headers, rows: rows.slice(0, MAX_IMPORT_ROWS) };
}

/** Import-flow options shared by preview + commit. */
export type CsvImportOptions = ImportOptions;

const fieldsOf = (kind: ImportKind): FieldCol[] =>
  fieldsFor(kind).map((f) => ({ name: f.name, label: f.label, required: f.required, options: [...(f.options ?? [])] }));

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
    fields: fieldsOf(kind),
  };
}

export type CsvPreview = CsvParse & {
  errors: CsvIssue[];
  valid: number;
  blocked: number;
  /** By-name kinds with createMissingCustomers: deduped names that will
   *  get NEW customer records at commit (first-seen spelling). */
  customersToCreate: string[];
};
export type CsvCommit = { imported: number; skipped: number; customersCreated: number; excludedUser: number };

/** Last commits shown to the owner under the importer. */
export type ImportHistoryRow = {
  id: string;
  kind: string;
  file_name: string;
  actor_name: string | null;
  row_count: number;
  imported: number;
  skipped: number;
  customers_created: number;
  excluded_user: number;
  created_at: string;
};

/** Step 2: full validation with the confirmed mapping, plus the DB-aware
 *  checks (duplicate stock/invoice numbers in this org, customer lookups,
 *  within-file duplicates). Writes nothing. */
export async function csvPreviewAction(
  kind: ImportKind,
  csv: string,
  mapping: Mapping,
  opts: CsvImportOptions = {},
): Promise<CsvPreview> {
  const session = await requireSessionAction();
  const { headers, rows } = parseFile(kind, csv);
  const dataRows = rows.slice(0, MAX_IMPORT_ROWS);
  const res = await importRows(session.organizationId, null, kind, mapping, dataRows, { ...opts, dryRun: true });
  return {
    headers: headers.slice(0, 60),
    mapping,
    total: dataRows.length,
    truncated: parseCsv(csv).rows.length > MAX_IMPORT_ROWS,
    fields: fieldsOf(kind),
    errors: res.issues,
    valid: dataRows.length - res.skipped,
    blocked: res.skipped,
    customersToCreate: res.customersToCreate,
  };
}/** Step 3: session-checked commit — re-validate inside a transaction, then
  *  insert the valid rows (handled in import-db). Every commit lands one
  *  import_history row so owners can see what entered CUE, from which file,
  *  when and by whom.
  *  fileName is LAST and optional: positional callers that predate the
  *  history log (scripts/e2e.mjs drives the real action with fixed args)
  *  pass `kind, csv, mapping, opts` and must not get their opts misread
  *  as an import-history file name — that regression blocked the whole
  *  createMissingCustomers commit path. */
export async function csvCommitAction(
  kind: ImportKind,
  csv: string,
  mapping: Mapping,
  opts: CsvImportOptions = {},
  fileName = "pasted.csv",
): Promise<CsvCommit> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only Owners, Admins and Managers can import data.");
  const orgId = session.organizationId;
  const { rows } = parseFile(kind, csv);
  const dataRows = rows.slice(0, MAX_IMPORT_ROWS);
  const res = await importRows(orgId, session.user.id, kind, mapping, dataRows, opts);

  try {
    await sql`
      insert into import_history
        (organization_id, actor_id, actor_name, kind, file_name, row_count, imported, skipped, customers_created, excluded_user)
      values (${orgId}, ${session.user.id}, ${session.user.name}, ${kind}, ${fileName.slice(0, 200)},
        ${dataRows.length}, ${res.imported}, ${res.skipped}, ${res.customersCreated}, ${res.excludedUser})`;
  } catch (e) {
    // The import itself is committed; a history-write failure must not
    // surface as a botched import. Log loudly instead.
    console.error("import_history insert failed", e);
  }

  // Intake checklist marks the import step done on the first successful import.
  if (res.imported > 0) {
    const patch = { csvImport: { done: true, at: new Date().toISOString(), kind, count: res.imported } };
    try {
      await sql`
        update business_profiles
        set intake_state = intake_state || ${sql.json(patch)}
        where organization_id = ${orgId}`;
    } catch (e) {
      console.error("intake_state update failed", e);
    }
  }

  revalidatePath("/intake");
  revalidatePath("/capture");
  revalidatePath("/intake/import");
  return { imported: res.imported, skipped: res.skipped, customersCreated: res.customersCreated, excludedUser: res.excludedUser };
}

// ── Reconciliation export ──────────────────────────────────────────
// Downloads an org's CURRENT record set for an import kind back as a CSV in
// the same column shape an import reads, so the owner can diff CUE against
// the source export in a spreadsheet (which rows landed, which got fixed by
// hand since). Read-only and org-scoped by session, like every other read.

export type ReconciliationExport = { fileName: string; csv: string };

/** RFC-4180 escaping — quote a field when it contains a comma, quote or
 *  newline, doubling embedded quotes (notes fields hit this constantly). */
function csvField(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportReconciliationAction(kind: ImportKind): Promise<ReconciliationExport> {
  const session = await requireSessionAction();
  if (session.role === "MEMBER") throw new Error("Only Owners, Admins and Managers can export data.");
  assertKind(kind);
  const orgId = session.organizationId;
  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
  const money = (x: unknown) => (x == null ? "" : String(Number(x)));

  let headers: string[];
  let rows: unknown[][];
  if (kind === "VEHICLES") {
    headers = ["Stock Number", "VIN", "Year", "Make", "Model", "Trim", "New or Used", "Inv Status", "List Price", "Date In Stock"];
    const r = await sql`
      select stock_number, vin, year, make, model, trim, kind, status, list_price, listed_at
      from vehicles where organization_id = ${orgId} order by stock_number`;
    rows = (r as unknown as Record<string, unknown>[]).map((v) => [
      v.stock_number, v.vin, v.year, v.make, v.model, v.trim, v.kind, v.status,
      money(v.list_price), d(v.listed_at as Date | null),
    ]);
  } else if (kind === "CUSTOMERS") {
    headers = ["Customer Name", "Email", "Phone", "Customer Type", "Address", "Account Notes"];
    const r = await sql`
      select name, email, phone, type, address, notes from customers
      where organization_id = ${orgId} order by name`;
    rows = (r as unknown as Record<string, unknown>[]).map((c) => [
      c.name, c.email, c.phone, c.type, c.address, c.notes,
    ]);
  } else if (kind === "INVOICES") {
    headers = ["Invoice Number", "Bill To", "Invoice Total", "Invoice Type", "Payment Status", "Invoice Date", "Due Date"];
    const r = await sql`
      select i.number, c.name as customer, i.amount, i.kind, i.status, i.issued_at, i.due_at
      from invoices i left join customers c on c.id = i.customer_id
      where i.organization_id = ${orgId} order by i.number`;
    rows = (r as unknown as Record<string, unknown>[]).map((v) => [
      v.number, v.customer, money(v.amount), v.kind, v.status,
      d(v.issued_at as Date | null), d(v.due_at as Date | null),
    ]);
  } else if (kind === "SERVICE_ORDERS") {
    headers = ["Job Title", "Customer Name", "Status", "Amount", "Opened Date", "Completed Date"];
    const r = await sql`
      select w.title, c.name as customer, w.status, w.amount, w.opened_at, w.completed_at
      from service_orders w left join customers c on c.id = w.customer_id
      where w.organization_id = ${orgId} order by w.opened_at desc, w.title`;
    rows = (r as unknown as Record<string, unknown>[]).map((v) => [
      v.title, v.customer, v.status, money(v.amount),
      d(v.opened_at as Date | null), d(v.completed_at as Date | null),
    ]);
  } else {
    headers = ["Customer Name", "Plan Name", "Annual Value", "Start Date", "End Date", "Status", "Notes"];
    const r = await sql`
      select c.name as customer, a.plan_name, a.annual_value, a.starts_at, a.ends_at, a.status, a.notes
      from maintenance_agreements a left join customers c on c.id = a.customer_id
      where a.organization_id = ${orgId} order by a.starts_at desc`;
    rows = (r as unknown as Record<string, unknown>[]).map((v) => [
      v.customer, v.plan_name, money(v.annual_value),
      d(v.starts_at as Date | null), d(v.ends_at as Date | null), v.status, v.notes,
    ]);
  }

  const csv = [headers, ...rows].map((cols) => cols.map(csvField).join(",")).join("\n") + "\n";
  const today = new Date().toISOString().slice(0, 10);
  return { fileName: `reconciliation-${kind.toLowerCase()}-${today}.csv`, csv };
}

// Revi's suggested order — the follow-up chase list built from the org's
// records (overdue money, stuck deliveries, unreachable customers). Read-only.
// Downloaded through the client card; the summary is computed during page
// render so the card shows the counts without a roundtrip.

export async function suggestedOrderCsvAction(): Promise<ReconciliationExport> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const [[org], ws] = await Promise.all([
    sql`select name from organizations where id = ${orgId}` as unknown as [{ name: string }],
    getWorkspaceProfile(orgId),
  ]);
  const order = await buildSuggestedOrder(orgId);
  const { fileName, csv } = suggestedOrderCsv(
    order,
    org?.name ?? "",
    ws.ambassadorName ?? "Revi",
    new Date().toISOString().slice(0, 10),
  );
  return { fileName, csv };
}

// ── Chase check-off ─────────────────────────────────────────────────
// Marking a follow-up chased ("done") drops it from the card, the digest and
// the order CSV until it's restored. This is view bookkeeping, not a change to
// the underlying record, so any signed-in role may do it — the same logic that
// lets MEMBERs see the card. Dismissals are org-shared (everyone stops seeing
// the row) and recorded, so the Restore strip shows who closed what.

const SUGGESTED_CATEGORIES: SuggestedOrderCategory[] = ["INVOICE_OVERDUE", "VEHICLE_IN_TRANSIT", "CONTACT_INFO"];

export async function dismissSuggestedOrderAction(category: string, record: string, detail: string): Promise<void> {
  const session = await requireSessionAction();
  const cat = SUGGESTED_CATEGORIES.find((c) => c === category);
  if (!cat) throw new Error("Unknown follow-up category.");
  await dismissSuggestedOrderItem(session.organizationId, session.user.id, session.user.name, { category: cat, record, detail });
  revalidatePath("/intake/import");
}

export async function restoreSuggestedOrderAction(id: string): Promise<void> {
  const session = await requireSessionAction();
  await restoreSuggestedOrderItem(session.organizationId, id);
  revalidatePath("/intake/import");
}
