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

// CSV importer — drops a real DMS/plate-list/service-board export into CUE's
// structured records. Three actions, one machinery core (src/lib/import-db.ts):
//   csvParseAction    — parse + headers + guessed mapping (no validation, no writes)
//   csvPreviewAction  — full validation + DB-collision checks (importRows dry-run)
//   csvCommitAction   — session + re-validate + insert + audit (importRows)
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
