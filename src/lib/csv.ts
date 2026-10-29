// Minimal RFC-4180-ish CSV parser — no dependency, covers what a DMS/plate-list
// export actually contains: quoted fields, commas and newlines inside quotes,
// literal "" escapes, CRLF or LF line endings, and a UTF-8 BOM. Plain module so
// both the client component and the server actions can use it.

export type CsvRow = Record<string, string>;
export type ParsedCsv = { headers: string[]; rows: CsvRow[] };

export function parseCsv(text: string): ParsedCsv {
  // Strip BOM + normalize line endings.
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let inQuotes = false;

  // First pass: find records (quoted newlines preserved).
  const records: string[] = [];
  let record = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          record += '""';
          i += 2;
          continue;
        }
        inQuotes = false;
      }
      record += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      record += ch;
      i += 1;
      continue;
    }
    if (ch === "\n") {
      records.push(record);
      record = "";
      i += 1;
      continue;
    }
    record += ch;
    i += 1;
  }
  records.push(record);

  // Second pass: split fields per record, honoring "" escapes.
  for (const rec of records) {
    // Skip fully-empty trailing records (a newline at EOF does not make a row).
    if (rec === "") continue;
    const cols: string[] = [];
    let cur = "";
    let q = false;
    let j = 0;
    while (j < rec.length) {
      const ch = rec[j];
      if (q) {
        if (ch === '"') {
          if (rec[j + 1] === '"') {
            cur += '"';
            j += 2;
            continue;
          }
          q = false;
          j += 1;
          continue;
        }
        cur += ch;
        j += 1;
        continue;
      }
      if (ch === '"') {
        q = true;
        j += 1;
        continue;
      }
      if (ch === ",") {
        cols.push(cur);
        cur = "";
        j += 1;
        continue;
      }
      cur += ch;
      j += 1;
    }
    cols.push(cur);
    // A row of all-empty cells (e.g. trailing commas) is not data; drop it.
    if (cols.every((c) => c.trim() === "")) continue;
    rows.push(cols);
  }

  const headers = rows.length ? rows[0].map((h, idx) => (h.trim() || `Column ${idx + 1}`)) : [];
  // Convert positional rows into by-header rows — every downstream consumer
  // (mapping UI, validator, DB-aware checks) keys columns by header name.
  return {
    headers,
    rows: rows.slice(1).map((cells) => {
      const obj: CsvRow = {};
      headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
      return obj;
    }),
  };
}

/** Normalize a CSV header into a guess key: lowercase, alnum only. */
export function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Import field model ─────────────────────────────────────────────
// Entity fields per import target. FIELD.type drives server validation; the
// same spec powers the client mapping UI and its auto-guess, so one edit here
// moves both. `guess` holds CSV header aliases (headerKey-normalized) in
// priority order — first hit wins.

export type CsvFieldType = "text" | "int" | "money" | "date" | "enum";
export type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  type?: CsvFieldType;
  options?: string[];
  guess: string[];
};

export const IMPORT_TYPES = {
  CUSTOMERS: [
    { name: "name", label: "Customer name", required: true, type: "text", guess: ["customername", "customer", "name", "contact", "companyname"] },
    { name: "email", label: "Email", type: "text", guess: ["email", "emailaddress", "email1"] },
    { name: "phone", label: "Phone", type: "text", guess: ["phone", "phonenumber", "phone1", "cellphone", "mobile", "workphone"] },
    { name: "type", label: "Type", type: "enum", options: ["RETAIL", "WHOLESALE", "FLEET"], guess: ["customertype", "type", "seg", "segment"] },
    { name: "address", label: "Address", type: "text", guess: ["address", "streetaddress", "addressline1", "mailingaddress"] },
    { name: "notes", label: "Notes", type: "text", guess: ["notes", "note", "comments", "comment"] },
  ],
  VEHICLES: [
    { name: "stock", label: "Stock number", required: true, type: "text", guess: ["stocknumber", "stockno", "stock", "stocknum", "invlocationcode"] },
    { name: "vin", label: "VIN", type: "text", guess: ["vin", "vinnumber"] },
    { name: "year", label: "Year", required: true, type: "int", guess: ["year", "modelyear", "yr"] },
    { name: "make", label: "Make", required: true, type: "text", guess: ["make", "manufacturer", "brand"] },
    { name: "model", label: "Model", required: true, type: "text", guess: ["model", "modelname"] },
    { name: "trim", label: "Trim", type: "text", guess: ["trim", "trimlevel", "trimpackage"] },
    { name: "kind", label: "Kind", type: "enum", options: ["NEW", "USED"], guess: [ "neworused", "vehiclekind", "kind", "inventorytype"] },
    { name: "status", label: "Status", type: "enum", options: ["IN_TRANSIT", "AVAILABLE", "RESERVED", "SOLD"], guess: ["status", "invstatus", "vehiclestatus"] },
    { name: "list_price", label: "List price", type: "money", guess: ["listprice", "askingprice", "retailprice", "internetprice", "price"] },
    { name: "cost", label: "Cost", type: "money", guess: ["cost", "purchaseprice", "invoiceprice", "acquisitioncost", "tradeallowance"] },
    { name: "listed_at", label: "Listed date", type: "date", guess: ["listdate", "listedat", "dateinstock", "instockdate", "dateinstock"] },
  ],
  INVOICES: [
    { name: "number", label: "Invoice number", required: true, type: "text", guess: ["invoicenumber", "invoiceno", "invoicenum", "invoice", "docnumber", "docno"] },
    { name: "customer", label: "Customer name", required: true, type: "text", guess: ["customername", "customer", "billto", "name", "accountname"] },
    { name: "amount", label: "Amount", required: true, type: "money", guess: ["invoicetotal", "amountdue", "amount", "total", "totalamount", "balance"] },
    { name: "kind", label: "Kind", type: "enum", options: ["DEAL", "SERVICE", "PARTS"], guess: ["invoicetype", "type", "kind"] },
    { name: "status", label: "Status", type: "enum", options: ["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"], guess: ["status", "paymentstatus", "invoicestatus"] },
    { name: "issued_at", label: "Issued date", type: "date", guess: ["issuedat", "invoicedate", "dateissued", "issued", "date"] },
    { name: "due_at", label: "Due date", type: "date", guess: ["duedate", "dueat", "date_due", "due"] },
  ],
  // Home-services pack targets: completed work-order history and maintenance
  // agreements, so an HVAC/HVAC-adjacent spreadsheet becomes structured
  // records instead of a dead captured file.
  SERVICE_ORDERS: [
    { name: "title", label: "Job title", required: true, type: "text", guess: ["title", "jobtitle", "workorderdescription", "workorder", "description", "summary", "job"] },
    { name: "customer", label: "Customer name", required: true, type: "text", guess: ["customername", "customer", "name", "accountname", "client"] },
    { name: "status", label: "Status", type: "enum", options: ["OPEN", "IN_PROGRESS", "AWAITING_PARTS", "COMPLETED"], guess: ["status", "orderstatus", "jobstatus"] },
    { name: "amount", label: "Amount", type: "money", guess: ["amount", "total", "totalamount", "ordertotal", "invoicetotal"] },
    { name: "opened_at", label: "Opened date", type: "date", guess: ["openedat", "dateopened", "orderdate", "workorderdate", "date", "createdat"] },
    { name: "completed_at", label: "Completed date", type: "date", guess: ["completedat", "datecompleted", "completeddate", "closeddate", "closedat"] },
  ],
  AGREEMENTS: [
    { name: "customer", label: "Customer name", required: true, type: "text", guess: ["customername", "customer", "name", "accountname", "client"] },
    { name: "plan_name", label: "Plan name", type: "text", guess: [ "planname", "plan", "agreementtype", "servicename", "maintenanceplan"] },
    { name: "annual_value", label: "Annual value", type: "money", guess: ["annualvalue", "value", "contractvalue", "annualamount", "amount", "price"] },
    { name: "starts_at", label: "Start date", type: "date", guess: ["startat", "startdate", "begindate", "effectivedate", "date", "createdat"] },
    { name: "ends_at", label: "End date", type: "date", guess: [ "endsat", "enddate", "renewaldate", "expirydate", "expiresat"] },
    { name: "status", label: "Status", type: "enum", options: ["ACTIVE", "EXPIRED", "CANCELLED"], guess: ["status", "agreementstatus", "planstatus"] },
    { name: "notes", label: "Notes", type: "text", guess: ["notes", "note", "comments"] },
  ],
} as const satisfies Record<string, FieldDef[]>;

export type ImportKind = keyof typeof IMPORT_TYPES;

/** Human label per import kind — shared by the importer and the history
 *  table. Lives in this plain module because a `"use server"` file can only
 *  export async functions (a const there breaks the Next build). */
export const KIND_LABELS: Record<ImportKind, string> = {
  CUSTOMERS: "Customers",
  VEHICLES: "Vehicles",
  INVOICES: "Invoices",
  SERVICE_ORDERS: "Service orders",
  AGREEMENTS: "Service plans",
};
export type Mapping = Partial<Record<string, string>>; // field name → CSV header

export function fieldsFor(kind: ImportKind): readonly FieldDef[] {
  return IMPORT_TYPES[kind];
}

/** Auto-guess the field → column mapping from the CSV headers. Unmatched
 *  columns stay unmapped (imported as nothing), unmatched fields stay null. */
export function guessMapping(kind: ImportKind, headers: string[]): Mapping {
  const keys = headers.map((h) => ({ header: h, key: headerKey(h) }));
  const out: Mapping = {};
  const used = new Set<string>();
  for (const field of fieldsFor(kind)) {
    for (const want of field.guess) {
      const hit = keys.find((k) => k.key === want && !used.has(k.header));
      if (hit) {
        out[field.name] = hit.header;
        used.add(hit.header);
        break;
      }
    }
  }
  return out;
}

// ── Row validation ─────────────────────────────────────────────────
// Value-level checks only (shape/types/enums). DB-aware checks (stock-number
// and invoice-number collisions, customer lookup) run server-side where the
// database lives.

export type RowIssue = { index: number; field: string | null; message: string };

export const MAX_IMPORT_ROWS = 2000;
const YEAR_MAX = new Date().getFullYear() + 2;

function nonEmpty(v: string | null): v is string {
  return v != null && v.trim() !== "";
}

/** Validate one mapped row. Returns the coerced insert values expanded per
 *  field, or null plus issues when invalid.*/
export function validateRow(
  kind: ImportKind,
  mapping: Mapping,
  row: CsvRow,
): { ok: true; values: Record<string, string | number | null> } | { ok: false; issues: { field: string; message: string }[] } {
  const issues: { field: string; message: string }[] = [];
  const values: Record<string, string | number | null> = {};
  for (const field of fieldsFor(kind)) {
    const header = mapping[field.name];
    const raw = header ? (row[header] ?? "").trim() : "";
    if (!nonEmpty(raw)) {
      if (field.required) issues.push({ field: field.name, message: `${field.label} is required` });
      else values[field.name] = null;
      continue;
    }
    switch (field.type) {
      case "money": {
        const n = parseMoney(raw);
        if (n == null) issues.push({ field: field.name, message: `${field.label}: “${raw}” is not a number` });
        else if (n < 0) issues.push({ field: field.name, message: `${field.label} cannot be negative` });
        else values[field.name] = n;
        break;
      }
      case "int": {
        const n = Number(raw.replace(/[\s,]/g, ""));
        if (!Number.isInteger(n)) issues.push({ field: field.name, message: `${field.label}: “${raw}” is not a whole number` });
        else if (field.name === "year" && (n < 1900 || n > YEAR_MAX)) issues.push({ field: field.name, message: `${field.label} ${n} is out of range (1900–${YEAR_MAX})` });
        else values[field.name] = n;
        break;
      }
      case "date": {
        const d = parseDate(raw);
        if (!d) issues.push({ field: field.name, message: `${field.label}: “${raw}” is not a date (use YYYY-MM-DD or MM/DD/YYYY)` });
        else values[field.name] = d.toISOString();
        break;
      }
      case "enum": {
        const up = raw.toUpperCase().replace(/[\s-]+/g, "_");
        if (!field.options!.includes(up)) issues.push({ field: field.name, message: `${field.label}: “${raw}” — expected one of ${field.options!.join(", ")}` });
        else values[field.name] = up;
        break;
      }
      default:
        values[field.name] = raw.slice(0, 300);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, values };
}

export function validateRows(kind: ImportKind, mapping: Mapping, rows: CsvRow[]): RowIssue[] {
  const out: RowIssue[] = [];
  rows.forEach((row, i) => {
    const r = validateRow(kind, mapping, row);
    if (!r.ok) {
      for (const issue of r.issues) out.push({ index: i, field: issue.field, message: issue.message });
    }
  });
  return out;
}

/** Best-effort money parse: accepts "$14,250.00", "14250", "14 250,00"-ish
 *  after removing separators used as thousands markers. Returns null when
 *  nothing numeric remains. */
export function parseMoney(raw: string | null): number | null {
  if (raw == null) return null;
  // Strips quote marks too: some exports mangle "$13,450" into a quoted
  // field whose escapes leave stray quote characters behind.
  const cleaned = raw.replace(/[$\s\"']/g, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    // Decorated values like "$240/yr" or "$1,080.00 subtotal": take the
    // leading numeric run instead of rejecting the whole column.
    const prefix = /^-?\d+(?:\.\d+)?/.exec(cleaned);
    if (!prefix) return null;
    return Number(prefix[0]);
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Accepts ISO (2021-04-01) or common US (04/01/2021) formats. */
export function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = /^\d{4}-\d{1,2}-\d{1,2}$/.exec(raw);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  let d: Date | null = null;
  if (iso) d = new Date(`${raw}T00:00:00Z`);
  else if (us) d = new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])));
  else {
    const t = Date.parse(raw);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
