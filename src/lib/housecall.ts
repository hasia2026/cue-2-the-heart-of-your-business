// Housecall Pro connector — pull sync + webhook normalization into CUE's
// canonical tables. Housecall's API money fields are integer cents and API
// keys use the `Authorization: Token <key>` header (OAuth uses Bearer, but this
// connector deliberately supports Pro API keys only). Appointments are pulled
// from the job's `appointments` expansion; the public schema does not document
// a confirmation field, so only an explicit signal is imported as CONFIRMED.
//
// Docs: https://docs.housecallpro.com/ · API keys:
// https://help.housecallpro.com/en/articles/8505035-api-overview
import { sql } from "./db";
import { logAudit } from "./audit";

const BASE = "https://api.housecallpro.com";
const SOURCE = "housecall_pro";

type Json = Record<string, unknown>;

export type SyncCounts = { customers: number; jobs: number; appointments: number; invoices: number };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Every Housecall Pro money field is an integer number of cents. */
function cents(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
}

function fullName(c: Json): string {
  const company = str(c.company);
  if (company) return company;
  const joined = [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ");
  return joined || "Housecall Pro customer";
}

function formatAddress(a: unknown): string | null {
  const raw = Array.isArray(a) ? a[0] : a;
  if (!raw || typeof raw !== "object") return str(raw);
  const o = raw as Json;
  const parts = [o.street, o.street_line_2, o.city, o.state, o.zip].map(str).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function addressArea(a: unknown): string | null {
  const raw = Array.isArray(a) ? a[0] : a;
  if (!raw || typeof raw !== "object") return null;
  return str((raw as Json).city);
}

function phoneOf(c: Json): string | null {
  return str(c.mobile_number) ?? str(c.home_number) ?? str(c.work_number) ?? str(c.phone);
}

async function call<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const detail = body.slice(0, 180).replace(/\s+/g, " ");
    throw new Error(`Housecall Pro ${res.status}${detail ? ` — ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Verify a key before storing it. `/company` is the cheapest authenticated read. */
export async function testHousecallPro(apiKey: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const data = await call<Json>(apiKey, "/company");
    const company = (data.company && typeof data.company === "object" ? data.company : data) as Json;
    const name = str(company.name) ?? str(company.company_name) ?? "Housecall Pro account";
    return { ok: true, name };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not reach Housecall Pro";
    return { ok: false, error: msg };
  }
}

async function listAll(apiKey: string, path: string, key: string): Promise<Json[]> {
  const out: Json[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 10; page++) {
    const data = await call<Json>(apiKey, `${path}${separator}page=${page}&page_size=100`);
    const rows = Array.isArray(data[key]) ? (data[key] as Json[]) : [];
    out.push(...rows);
    const totalPages = Number(data.total_pages ?? page);
    if (!rows.length || page >= totalPages || rows.length < 100) break;
  }
  return out;
}

async function upsertCustomer(orgId: string, c: Json): Promise<string | null> {
  const ext = str(c.id);
  if (!ext) return null;
  const [row] = (await sql`
    insert into customers (organization_id, name, email, phone, address, area, external_source, external_id, created_at)
    values (${orgId}, ${fullName(c)}, ${str(c.email)}, ${phoneOf(c)}, ${formatAddress(c.address)}, ${addressArea(c.address)},
            ${SOURCE}, ${ext}, ${dateOrNull(c.created_at) ?? new Date()})
    on conflict (organization_id, external_source, external_id) where external_id is not null
    do update set
      name = excluded.name,
      email = coalesce(excluded.email, customers.email),
      phone = coalesce(excluded.phone, customers.phone),
      address = coalesce(excluded.address, customers.address),
      area = coalesce(excluded.area, customers.area)
    returning id`) as unknown as { id: string }[];
  return row?.id ?? null;
}

async function customerIdFor(orgId: string, customer: unknown, fallbackId: unknown): Promise<string | null> {
  const obj = customer && typeof customer === "object" ? (customer as Json) : null;
  if (obj?.id) {
    const id = await upsertCustomer(orgId, obj);
    if (id) return id;
  }
  const ext = str(fallbackId);
  if (!ext) return null;
  const [row] = await sql`
    select id from customers
    where organization_id = ${orgId} and external_source = ${SOURCE} and external_id = ${ext}
    limit 1`;
  return (row?.id as string | undefined) ?? null;
}

function jobStatus(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("complete") || s === "rated") return "COMPLETED";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("progress") || s.includes("started")) return "IN_PROGRESS";
  return "OPEN";
}

async function upsertJob(orgId: string, j: Json): Promise<boolean> {
  const ext = str(j.id);
  if (!ext) return false;
  const customerId = await customerIdFor(orgId, j.customer, j.customer_id);
  if (!customerId) return false;
  const work = (j.work_timestamps && typeof j.work_timestamps === "object" ? j.work_timestamps : {}) as Json;
  // A scheduled end is not a completion. Only an explicit completion timestamp
  // may mark work complete; otherwise an upcoming visit would look billable.
  const completed = dateOrNull(work.completed_at) ?? dateOrNull(j.completed_at);
  const status = jobStatus(j.work_status ?? j.status);
  const title = str(j.description) ?? str(j.invoice_number) ?? "Housecall Pro job";
  await sql`
    insert into service_orders
      (organization_id, customer_id, title, status, amount, opened_at, completed_at, property_address, external_source, external_id)
    values
      (${orgId}, ${customerId}, ${title}, ${status}, ${cents(j.total_amount ?? j.amount)},
       ${dateOrNull(j.created_at) ?? new Date()}, ${completed}, ${formatAddress(j.address)}, ${SOURCE}, ${ext})
    on conflict (organization_id, external_source, external_id) where external_id is not null
    do update set
      customer_id = excluded.customer_id,
      title = excluded.title,
      status = excluded.status,
      amount = excluded.amount,
      completed_at = coalesce(excluded.completed_at, service_orders.completed_at),
      property_address = coalesce(excluded.property_address, service_orders.property_address)`;
  return true;
}

type ExternalConfirmation = { status: "CONFIRMED" | null; at: Date | null; raw: string | null };

function confirmationValue(value: unknown, dateValue = false): boolean | null {
  if (typeof value === "boolean") return value;
  if (dateValue) return dateOrNull(value) ? true : null;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (!s) return null;
    if (["confirmed", "true", "yes", "customer confirmed", "customer_confirmed"].includes(s)) return true;
    if (["unconfirmed", "not confirmed", "not_confirmed", "pending", "false", "no"].includes(s)) return false;
  }
  if (value && typeof value === "object") {
    const o = value as Json;
    return confirmationValue(o.status ?? o.confirmed ?? o.confirmed_at, o.confirmed_at != null);
  }
  return null;
}

/**
 * Housecall Pro's documented Appointment schema has no confirmation field.
 * Some accounts/API versions expose an explicit confirmed flag or confirmation
 * status, so accept those when present and never infer confirmation from a
 * scheduled status. A missing field leaves the local record untouched.
 */
function hcpConfirmation(appt: Json, job: Json): ExternalConfirmation {
  const confirmationObj = appt.confirmation && typeof appt.confirmation === "object" ? (appt.confirmation as Json) : null;
  const candidates: { value: unknown; date?: boolean; label: string }[] = [
    { value: appt.confirmed, label: "confirmed" },
    { value: appt.is_confirmed, label: "is_confirmed" },
    { value: appt.customer_confirmed, label: "customer_confirmed" },
    { value: appt.confirmation_status, label: "confirmation_status" },
    { value: confirmationObj?.status, label: "confirmation.status" },
    { value: appt.confirmed_at, label: "confirmed_at", date: true },
    { value: confirmationObj?.confirmed_at, label: "confirmation.confirmed_at", date: true },
    { value: job.confirmed, label: "job.confirmed" },
    { value: job.confirmation_status, label: "job.confirmation_status" },
    { value: job.confirmed_at, label: "job.confirmed_at", date: true },
  ];
  for (const c of candidates) {
    if (confirmationValue(c.value, c.date) === true) {
      const at = c.date
        ? dateOrNull(c.value)
        : dateOrNull(appt.confirmed_at) ?? dateOrNull(confirmationObj?.confirmed_at) ?? null;
      return { status: "CONFIRMED", at, raw: typeof c.value === "string" ? c.value : c.label };
    }
  }
  const explicit = str(appt.confirmation_status) ?? str(confirmationObj?.status) ?? str(job.confirmation_status);
  return { status: null, at: null, raw: explicit };
}

function appointmentStatus(appt: Json, job: Json): string {
  const own = String(appt.status ?? "").toLowerCase();
  if (own.includes("cancel")) return "CANCELLED";
  if (own.includes("complete")) return "COMPLETED";
  const jobState = String(job.work_status ?? job.status ?? "").toLowerCase();
  if (jobState.includes("cancel")) return "CANCELLED";
  if (jobState.includes("complete")) return "COMPLETED";
  return "SCHEDULED";
}

/** Upsert one job appointment and, only when HCP supplies an explicit signal,
 *  mark the durable confirmation record confirmed. */
async function upsertAppointment(orgId: string, job: Json, appt: Json): Promise<boolean> {
  const ext = str(appt.id);
  const jobExt = str(job.id) ?? str(appt.job_id);
  if (!ext || !jobExt) return false;
  const [order] = (await sql`
    select id, customer_id, title from service_orders
    where organization_id = ${orgId} and external_source = ${SOURCE} and external_id = ${jobExt}
    limit 1`) as unknown as { id: string; customer_id: string; title: string }[];
  if (!order) return false;
  const schedule = job.schedule && typeof job.schedule === "object" ? (job.schedule as Json) : null;
  const start = dateOrNull(appt.start_time) ?? dateOrNull(appt.start_date) ?? dateOrNull(schedule?.scheduled_start);
  if (!start) return false;
  const end = dateOrNull(appt.end_time) ?? dateOrNull(schedule?.scheduled_end);
  const rawWindow = Number(appt.arrival_window_minutes ?? schedule?.arrival_window);
  const arrivalWindow = Number.isFinite(rawWindow) && rawWindow > 0 ? Math.round(rawWindow) : null;
  const status = appointmentStatus(appt, job);
  const confirmation = hcpConfirmation(appt, job);
  const title = str(job.description) ?? order.title ?? "Housecall Pro appointment";
  const [row] = (await sql`
    insert into appointments
      (organization_id, customer_id, title, kind, scheduled_for, status, external_source, external_id,
       external_job_id, service_order_id, ends_at, arrival_window_minutes, external_confirmation_status,
       external_confirmed_at, last_synced_at)
    values (${orgId}, ${order.customer_id}, ${title}, 'SERVICE', ${start.toISOString()}, ${status},
            ${SOURCE}, ${ext}, ${jobExt}, ${order.id}, ${end?.toISOString() ?? null}, ${arrivalWindow},
            ${confirmation.raw}, ${confirmation.at?.toISOString() ?? null}, now())
    on conflict (organization_id, external_source, external_id) where external_id is not null
    do update set
      customer_id = excluded.customer_id,
      title = excluded.title,
      scheduled_for = excluded.scheduled_for,
      status = case when appointments.status = 'SCHEDULED' then excluded.status else appointments.status end,
      service_order_id = excluded.service_order_id,
      external_job_id = excluded.external_job_id,
      ends_at = excluded.ends_at,
      arrival_window_minutes = excluded.arrival_window_minutes,
      external_confirmation_status = coalesce(excluded.external_confirmation_status, appointments.external_confirmation_status),
      external_confirmed_at = coalesce(excluded.external_confirmed_at, appointments.external_confirmed_at),
      last_synced_at = now()
    returning id`) as unknown as { id: string }[];
  if (!row) return false;
  if (confirmation.status === "CONFIRMED") {
    const at = (confirmation.at ?? new Date()).toISOString();
    const [existing] = (await sql`
      select confirmed_at from appointment_confirmations where appointment_id = ${row.id}`) as unknown as { confirmed_at: string | null }[];
    await sql`
      insert into appointment_confirmations (organization_id, appointment_id, status, method, confirmed_at)
      values (${orgId}, ${row.id}, 'CONFIRMED', 'HOUSECALL_PRO', ${at})
      on conflict (appointment_id) do update set
        status = 'CONFIRMED',
        method = case when appointment_confirmations.confirmed_at is null then 'HOUSECALL_PRO' else appointment_confirmations.method end,
        confirmed_at = coalesce(appointment_confirmations.confirmed_at, excluded.confirmed_at),
        updated_at = now()`;
    await sql`update appointments set confirmed_at = coalesce(confirmed_at, ${at}) where id = ${row.id}`;
    if (!existing?.confirmed_at) {
      await logAudit({
        organizationId: orgId,
        actorType: "SYSTEM",
        action: "APPOINTMENT_CONFIRMED_FROM_HOUSECALL",
        targetType: "Appointment",
        targetId: row.id,
        detail: `"${title}" marked confirmed from Housecall Pro (${confirmation.raw ?? "explicit confirmation"})`,
        metadata: { external_id: ext, external_job_id: jobExt, signal: confirmation.raw },
      });
    }
  }
  return true;
}

async function appointmentsForJob(apiKey: string, job: Json): Promise<Json[]> {
  if (Array.isArray(job.appointments)) return job.appointments as Json[];
  const id = str(job.id);
  if (!id) return [];
  // The documented nested collection is a safe fallback when a list response
  // ignores the appointments expansion.
  const data = await call<Json | Json[]>(apiKey, `/jobs/${encodeURIComponent(id)}/appointments?page=1&page_size=100`);
  if (Array.isArray(data)) return data as Json[];
  return Array.isArray(data.appointments) ? (data.appointments as Json[]) : [];
}

async function syncJobAppointments(orgId: string, job: Json, apiKey?: string): Promise<number> {
  const appointments = apiKey ? await appointmentsForJob(apiKey, job) : Array.isArray(job.appointments) ? (job.appointments as Json[]) : [];
  let count = 0;
  for (const appt of appointments) {
    if (appt && typeof appt === "object" && await upsertAppointment(orgId, job, appt)) count += 1;
  }
  return count;
}

function invoiceStatus(raw: unknown, dueAt: Date | null): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "paid") return "PAID";
  // Documented terminal statuses: voided, canceled, uncollectible.
  if (s === "voided" || s === "void" || s === "canceled" || s === "cancelled" || s === "uncollectible") return "VOID";
  // A payment in flight is issued, not settled and not overdue yet.
  if (s === "pending_payment") return "SENT";
  // `open` (including partially paid) and unknown issued states age by due date.
  return dueAt && dueAt.getTime() < Date.now() ? "OVERDUE" : "SENT";
}

async function upsertInvoice(orgId: string, inv: Json): Promise<boolean> {
  const ext = str(inv.id);
  if (!ext) return false;
  const jobExt = str(inv.job_id);
  const [job] = jobExt
    ? (await sql`
        select id, customer_id from service_orders
        where organization_id = ${orgId} and external_source = ${SOURCE} and external_id = ${jobExt}
        limit 1`) as unknown as { id: string; customer_id: string }[]
    : [];
  // Invoice list responses carry job_id, not customer_id. Resolve the synced
  // job first; fall back to an embedded customer when a webhook supplies one.
  const customerId = (await customerIdFor(orgId, inv.customer, inv.customer_id)) ?? job?.customer_id ?? null;
  if (!customerId) return false;
  const dueAt = dateOrNull(inv.due_at);
  const paidAt = dateOrNull(inv.paid_at);
  const issuedAt = dateOrNull(inv.invoice_date) ?? dateOrNull(inv.sent_at) ?? dateOrNull(inv.created_at) ?? new Date();
  const number = str(inv.invoice_number) ?? str(inv.number) ?? ext;
  const amount = cents(inv.amount ?? inv.due_amount);
  const status = invoiceStatus(inv.status, dueAt);
  await sql`
    insert into invoices
      (organization_id, customer_id, service_order_id, number, kind, amount, status, issued_at, due_at, paid_at, external_source, external_id)
    values (${orgId}, ${customerId}, ${job?.id ?? null}, ${number}, 'SERVICE', ${amount}, ${status}, ${issuedAt}, ${dueAt}, ${paidAt}, ${SOURCE}, ${ext})
    on conflict (organization_id, external_source, external_id) where external_id is not null
    do update set
      customer_id = excluded.customer_id,
      service_order_id = coalesce(excluded.service_order_id, invoices.service_order_id),
      number = excluded.number,
      amount = excluded.amount,
      status = excluded.status,
      due_at = excluded.due_at,
      paid_at = excluded.paid_at`;
  return true;
}

/** Pull customers, jobs, their appointments and invoices into CUE. */
export async function syncHousecallPro(orgId: string, apiKey: string): Promise<SyncCounts> {
  const [customers, jobs, invoices] = await Promise.all([
    listAll(apiKey, "/customers", "customers"),
    listAll(apiKey, "/jobs?expand=appointments", "jobs"),
    listAll(apiKey, "/invoices", "invoices"),
  ]);

  const counts: SyncCounts = { customers: 0, jobs: 0, appointments: 0, invoices: 0 };
  for (const c of customers) if (await upsertCustomer(orgId, c)) counts.customers += 1;
  for (const j of jobs) {
    if (await upsertJob(orgId, j)) {
      counts.jobs += 1;
      counts.appointments += await syncJobAppointments(orgId, j, apiKey);
    }
  }
  for (const i of invoices) if (await upsertInvoice(orgId, i)) counts.invoices += 1;

  await sql`
    update integrations set status = 'CONNECTED', last_sync_at = now()
    where organization_id = ${orgId} and key = 'housecall_pro'`;
  return counts;
}

export type ReconciliationResult = {
  attempted: boolean;
  applied: number;
  skipped?: string;
  error?: string;
};

function entityObject(data: Json, key: string): Json | null {
  const direct = data[key];
  if (direct && typeof direct === "object") return direct as Json;
  const nested = data.data;
  if (nested && typeof nested === "object") {
    const value = (nested as Json)[key];
    if (value && typeof value === "object") return value as Json;
  }
  return null;
}

/** GET a single canonical record, tolerating the two invoice path variants in
 *  Housecall Pro's public docs (`/invoices/:id` and `/api/invoices/:id`). */
async function freshRecord(apiKey: string, paths: string[]): Promise<Json> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      const data = await call<Json>(apiKey, path);
      return data;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Housecall Pro record could not be read");
}

/**
 * Webhook reconciliation: do not blindly trust the event snapshot. Read the
 * affected canonical record from Housecall Pro and upsert that fresh version.
 * The webhook payload is still applied first, so a transient API failure never
 * loses the event — it is recorded as a reconciliation warning and the next
 * pull sync repairs it.
 */
export async function reconcileHousecallEvent(
  orgId: string,
  apiKey: string,
  payload: Json,
): Promise<ReconciliationResult> {
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Json) : payload;
  let applied = 0;
  let attempted = false;
  const errors: string[] = [];

  const job = entityObject(data, "job");
  if (job) {
    const id = str(job.id);
    if (id) {
      attempted = true;
      try {
        const fresh = await freshRecord(apiKey, [`/jobs/${encodeURIComponent(id)}?expand=appointments`]);
        const record = entityObject(fresh, "job") ?? fresh;
        if (await upsertJob(orgId, record)) {
          applied += 1;
          applied += await syncJobAppointments(orgId, record, apiKey);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "job reconciliation failed");
      }
    }
  }

  const invoice = entityObject(data, "invoice");
  if (invoice) {
    const id = str(invoice.id);
    if (id) {
      attempted = true;
      try {
        const fresh = await freshRecord(apiKey, [
          `/invoices/${encodeURIComponent(id)}`,
          `/api/invoices/${encodeURIComponent(id)}`,
        ]);
        const record = entityObject(fresh, "invoice") ?? fresh;
        if (await upsertInvoice(orgId, record)) applied += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "invoice reconciliation failed");
      }
    }
  }

  const customer = entityObject(data, "customer");
  if (customer) {
    const id = str(customer.id);
    if (id) {
      attempted = true;
      try {
        const fresh = await freshRecord(apiKey, [`/customers/${encodeURIComponent(id)}`]);
        const record = entityObject(fresh, "customer") ?? fresh;
        if (await upsertCustomer(orgId, record)) applied += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "customer reconciliation failed");
      }
    }
  }

  // Appointment events carry the parent job id, not a customer/job snapshot.
  const appointment = entityObject(data, "appointment");
  if (appointment) {
    const jobId = str(appointment.job_id);
    if (jobId) {
      attempted = true;
      try {
        const fresh = await freshRecord(apiKey, [`/jobs/${encodeURIComponent(jobId)}?expand=appointments`]);
        const record = entityObject(fresh, "job") ?? fresh;
        if (await upsertJob(orgId, record)) {
          applied += 1;
          applied += await syncJobAppointments(orgId, record, apiKey);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "appointment job reconciliation failed");
      }
    }
  }

  if (!attempted) return { attempted: false, applied: 0, skipped: "No supported entity in this event" };
  return {
    attempted: true,
    applied,
    ...(errors.length ? { error: errors.join(" · ").slice(0, 500) } : {}),
  };
}

/** Normalize one webhook body. Counts are touched rows, not rows created. */
export async function ingestHousecallWebhook(orgId: string, payload: Json): Promise<SyncCounts> {
  const counts: SyncCounts = { customers: 0, jobs: 0, appointments: 0, invoices: 0 };
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Json) : payload;

  const customer = data.customer && typeof data.customer === "object" ? (data.customer as Json) : null;
  const job = data.job && typeof data.job === "object" ? (data.job as Json) : null;
  const appointment = data.appointment && typeof data.appointment === "object" ? (data.appointment as Json) : null;
  const invoice = data.invoice && typeof data.invoice === "object" ? (data.invoice as Json) : null;

  if (customer && !job && (await upsertCustomer(orgId, customer))) counts.customers += 1;
  if (job) {
    const embedded = job.customer && typeof job.customer === "object" ? (job.customer as Json) : null;
    if (embedded && (await upsertCustomer(orgId, embedded))) counts.customers += 1;
    if (await upsertJob(orgId, job)) {
      counts.jobs += 1;
      counts.appointments += await syncJobAppointments(orgId, job);
    }
  }
  if (appointment && !job) {
    const jobExt = str(appointment.job_id);
    if (jobExt) {
      const [order] = (await sql`
        select title from service_orders
        where organization_id = ${orgId} and external_source = ${SOURCE} and external_id = ${jobExt}
        limit 1`) as unknown as { title: string }[];
      const jobContext: Json = { id: jobExt, description: order?.title ?? "Housecall Pro appointment" };
      if (await upsertAppointment(orgId, jobContext, appointment)) counts.appointments += 1;
    }
  }
  if (invoice) {
    const embedded = invoice.customer && typeof invoice.customer === "object" ? (invoice.customer as Json) : null;
    if (embedded && (await upsertCustomer(orgId, embedded))) counts.customers += 1;
    if (await upsertInvoice(orgId, invoice)) counts.invoices += 1;
  }

  return counts;
}
