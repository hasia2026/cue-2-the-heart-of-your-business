// Suggested order — what Revi tells the owner to chase next, written from the
// SAME org-scoped records the reconciliation export reads (no AI involved:
// the counts are facts, the ambassador is just the voice). Three categories,
// priority-ordered — money first, then deliveries, then data gaps:
//   1. INVOICE_OVERDUE    — unpaid invoices past their due date (status OVERDUE,
//                           or SENT whose due date has slipped)
//   2. VEHICLE_IN_TRANSIT — inventory that never finished arriving
//   3. CONTACT_INFO       — customers we can't reach (no email or no phone)
// Rows the owner has chased and checked off live on
// suggested_order_dismissals (scripts/migrate-suggested-order-dismissals.sql)
// and are excluded from the build here — the card, the digest and the CSV all
// show only what is still open, so a completed chase disappears everywhere at
// once and comes back only by restore (the underlying record never changed).
// Plain module (no next/headers): server actions hand it a session-derived
// org id, server pages call it directly during render.
import { sql } from "./db";

export type SuggestedOrderCategory = "INVOICE_OVERDUE" | "VEHICLE_IN_TRANSIT" | "CONTACT_INFO";

export type SuggestedOrderRow = {
  priority: number;
  category: SuggestedOrderCategory;
  record: string;
  detail: string;
  ask: string;
  customer: string;
  customerPhone: string;
  customerEmail: string;
  since: string;
};

export type SuggestedOrder = {
  rows: SuggestedOrderRow[];
  summary: { invoices: number; invoiceTotal: number; vehicles: number; contact: number };
  /** Live dismissal rows for the org — chases checked off by the owner.
   *  May include rows whose record no longer matches (paid, landed, filled in);
   *  callers treat it as "how many were checked off", not "how many hidden". */
  dismissedCount: number;
};

export type DismissedItem = {
  id: string;
  category: SuggestedOrderCategory;
  record: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const money = (x: unknown) => `$${Number(x ?? 0).toFixed(2)}`;

/** Priority-ordered chase list for one org. Overdue money first. Rows with a
 *  live dismissal (a completed chase) are excluded — see the header comment. */
export async function buildSuggestedOrder(orgId: string): Promise<SuggestedOrder> {
  const rows: SuggestedOrderRow[] = [];

  const [dismissedRow] = (await sql`select count(*)::int as n from suggested_order_dismissals where organization_id = ${orgId}`) as unknown as { n: number }[];
  const dismissedCount = Number(dismissedRow?.n ?? 0);

  const inv = await sql`
    select i.number, i.amount, i.kind, i.status, i.due_at,
           c.name as customer, c.phone as customer_phone, c.email as customer_email
    from invoices i left join customers c on c.id = i.customer_id
    where i.organization_id = ${orgId}
      and (i.status = 'OVERDUE' or (i.status = 'SENT' and i.due_at < now()))
      and not exists (
        select 1 from suggested_order_dismissals dod
        where dod.organization_id = i.organization_id
          and dod.category = 'INVOICE_OVERDUE'
          and dod.record = i.number)
    order by i.due_at asc nulls last, i.number`;
  let invoiceTotal = 0;
  let invoices = 0;
  for (const r of inv as unknown as Record<string, unknown>[]) {
    invoiceTotal += Number(r.amount ?? 0);
    invoices += 1;
    rows.push({
      priority: rows.length + 1,
      category: "INVOICE_OVERDUE",
      record: String(r.number ?? ""),
      // Amount + kind only — the category already carries "overdue", so
      // repeating the status tripled the wording on the card and in the CSV.
      detail: `${money(r.amount)} ${String(r.kind ?? "")}`.trim(),
      ask: "Collect payment",
      customer: String(r.customer ?? ""),
      customerPhone: String(r.customer_phone ?? ""),
      customerEmail: String(r.customer_email ?? ""),
      since: d(r.due_at as Date | null),
    });
  }

  const veh = await sql`
    select stock_number, year, make, model, trim, listed_at
    from vehicles
    where organization_id = ${orgId} and status = 'IN_TRANSIT'
      and not exists (
        select 1 from suggested_order_dismissals dod
        where dod.organization_id = vehicles.organization_id
          and dod.category = 'VEHICLE_IN_TRANSIT'
          and dod.record = vehicles.stock_number)
    order by listed_at asc nulls last, stock_number`;
  let vehicles = 0;
  for (const r of veh as unknown as Record<string, unknown>[]) {
    vehicles += 1;
    rows.push({
      priority: rows.length + 1,
      category: "VEHICLE_IN_TRANSIT",
      record: String(r.stock_number ?? ""),
      detail: `${r.year} ${r.make} ${r.model}${r.trim ? ` ${r.trim}` : ""}`.trim(),
      ask: "Confirm arrival / update status",
      customer: "",
      customerPhone: "",
      customerEmail: "",
      since: d(r.listed_at as Date | null),
    });
  }

  const cust = await sql`
    select name, email, phone
    from customers
    where organization_id = ${orgId} and (coalesce(email, '') = '' or coalesce(phone, '') = '')
      and not exists (
        select 1 from suggested_order_dismissals dod
        where dod.organization_id = customers.organization_id
          and dod.category = 'CONTACT_INFO'
          and dod.record = customers.name)
    order by name`;
  let contact = 0;
  for (const r of cust as unknown as Record<string, unknown>[]) {
    contact += 1;
    const missing = [
      String(r.email ?? "") === "" ? "email" : null,
      String(r.phone ?? "") === "" ? "phone" : null,
    ].filter(Boolean) as string[];
    rows.push({
      priority: rows.length + 1,
      category: "CONTACT_INFO",
      record: String(r.name ?? ""),
      detail: `Missing ${missing.join(" + ")}`,
      ask: "Collect contact details",
      customer: String(r.name ?? ""),
      customerPhone: String(r.phone ?? ""),
      customerEmail: String(r.email ?? ""),
      since: "",
    });
  }

  return {
    rows,
    summary: { invoices, invoiceTotal, vehicles, contact },
    dismissedCount,
  };
}

/** Recently dismissed rows, newest first — the card's "brought back" strip. */
export async function listDismissed(orgId: string, limit = 8): Promise<DismissedItem[]> {
  const r = await sql`
    select id, category, record, detail, actor_name, created_at
    from suggested_order_dismissals
    where organization_id = ${orgId}
    order by created_at desc
    limit ${limit}`;
  return (r as unknown as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    category: x.category as SuggestedOrderCategory,
    record: String(x.record ?? ""),
    detail: (x.detail as string | null) ?? null,
    actorName: (x.actor_name as string | null) ?? null,
    createdAt: new Date(x.created_at as string).toISOString(),
  }));
}

/** Check off a chase: drop the row from the card/digest/CSV until restored. */
export async function dismissSuggestedOrderItem(
  orgId: string,
  actorId: string,
  actorName: string,
  row: { category: SuggestedOrderCategory; record: string; detail: string },
): Promise<void> {
  if (row.record.trim() === "") throw new Error("Nothing to dismiss — the row is empty.");
  await sql`
    insert into suggested_order_dismissals (organization_id, category, record, detail, actor_id, actor_name)
    values (${orgId}, ${row.category}, ${row.record.slice(0, 200)}, ${row.detail.slice(0, 300)}, ${actorId}, ${actorName})
    on conflict (organization_id, category, record) do nothing`;
}

/** Bring a dismissed row back (by dismissal id, org-scoped). */
export async function restoreSuggestedOrderItem(orgId: string, id: string): Promise<void> {
  await sql`delete from suggested_order_dismissals where organization_id = ${orgId} and id = ${id}`;
}

const COLUMNS = ["Priority", "Category", "Record", "Detail", "What to ask for", "Customer", "Customer Phone", "Customer Email", "Since"] as const;

function csvField(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The order as a downloadable CSV (same escaping as the reconciliation export).
 *  Dismissed rows are deliberately excluded — the worklist is what's still open. */
export function suggestedOrderCsv(order: SuggestedOrder, orgName: string, ambassadorName: string, today: string): { fileName: string; csv: string } {
  const intro = [
    [`${ambassadorName}'s suggested order`],
    [`Organization: ${orgName}`],
    [`Generated: ${today}`],
    ["Source: your imported records — reconcile against the original export if counts look off."],
    [`Note: chases you checked off are not listed here — the worklist is what's still open.`],
    [],
  ];
  const body = [COLUMNS, ...order.rows.map((r) => [r.priority, r.category, r.record, r.detail, r.ask, r.customer, r.customerPhone, r.customerEmail, r.since])];
  const csv = [...intro, ...body].map((cols) => cols.map(csvField).join(",")).join("\n") + "\n";
  return { fileName: `suggested-order-${today}.csv`, csv };
}
