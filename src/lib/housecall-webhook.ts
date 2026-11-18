// Housecall Pro webhook delivery layer.
//
// The raw body is the only trustworthy input for signature verification:
// Housecall signs `Api-Timestamp + "." + rawBody` with HMAC-SHA256. Parse JSON
// only after the signature passes (or after the integration has no signing
// secret configured, which keeps the existing per-org URL token as fallback).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "./db";
import { logAudit } from "./audit";
import { decryptSecret } from "./secretbox";
import {
  ingestHousecallWebhook,
  reconcileHousecallEvent,
  type ReconciliationResult,
  type SyncCounts,
} from "./housecall";

type Json = Record<string, unknown>;
type SqlJson = Parameters<typeof sql.json>[0];

export type SignatureStatus = "VERIFIED" | "INVALID" | "MISSING" | "NOT_CONFIGURED";
export type WebhookStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "SKIPPED" | "REJECTED";

export type SignatureVerdict = {
  ok: boolean;
  status: SignatureStatus;
  error?: string;
};

export type WebhookEventRow = {
  id: string;
  organization_id: string;
  provider_event_id: string;
  event_name: string | null;
  entity_type: string | null;
  entity_external_id: string | null;
  status: WebhookStatus;
  signature_status: SignatureStatus;
  signature_verified: boolean;
  attempts: number;
  last_error: string | null;
  counts: SyncCounts | null;
  reconciliation: ReconciliationResult | null;
  raw_body: string;
  payload: Json | null;
  received_at: Date;
  last_attempt_at: Date | null;
  processed_at: Date | null;
  replayed_at: Date | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Postgres text cannot contain NUL. Provider payload text is untrusted, so
 *  scrub it before writing audit metadata or an error message. */
function dbText(v: unknown, max = 500): string | null {
  const s = str(v);
  return s ? s.replace(/\u0000/g, "").slice(0, max) : null;
}

function jsonObject(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function dateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** HCP documents the timestamp and signature headers, but no freshness window;
 *  the durable event-id key makes a replay a no-op, so we follow the published
 *  HMAC verification exactly instead of rejecting delayed provider retries. */
export function verifyHousecallSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | null,
  configured: boolean,
): SignatureVerdict {
  if (!configured) return { ok: true, status: "NOT_CONFIGURED" };
  if (!secret) {
    return { ok: false, status: "INVALID", error: "The saved signing secret could not be decrypted. Re-save it in Ecosystem." };
  }
  if (!timestamp || !signature) {
    return { ok: false, status: "MISSING", error: "Api-Timestamp or Api-Signature header is missing." };
  }

  const expectedHex = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const normalized = signature.trim().replace(/^sha256=/i, "");
  const candidates = [expectedHex, Buffer.from(expectedHex, "hex").toString("base64")];
  const supplied = Buffer.from(normalized);
  for (const candidate of candidates) {
    const expected = Buffer.from(candidate);
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      return { ok: true, status: "VERIFIED" };
    }
  }
  return { ok: false, status: "INVALID", error: "Api-Signature does not match the raw request body." };
}

export type WebhookEntity = { type: string | null; externalId: string | null };

const ENTITY_KEYS = ["job", "appointment", "customer", "invoice", "estimate", "lead", "partner_job"] as const;

/** Find the affected canonical entity in both the documented top-level shape
 *  and the legacy `{ data: { job: ... } }` envelope. */
export function webhookEntity(payload: Json | null): WebhookEntity {
  if (!payload) return { type: null, externalId: null };
  const data = jsonObject(payload.data) ?? payload;
  for (const key of ENTITY_KEYS) {
    const entity = jsonObject(data[key]);
    if (entity) return { type: key, externalId: str(entity.id) };
  }
  return { type: null, externalId: null };
}

export function webhookEventName(payload: Json | null): string | null {
  if (!payload) return null;
  return str(payload.event) ?? str(payload.event_name) ?? str(payload.type);
}

/**
 * Prefer an explicit provider/event id. Housecall's public payload does not
 * publish one, so retries of the same body get a stable SHA-256 identity.
 */
export function webhookEventId(headers: Headers, payload: Json | null, rawBody: string): string {
  const headerId =
    str(headers.get("x-housecall-event-id")) ??
    str(headers.get("x-housecall-delivery-id")) ??
    str(headers.get("x-webhook-id"));
  if (headerId) return headerId.slice(0, 500);
  if (payload) {
    const bodyId =
      str(payload.event_id) ??
      str(payload.webhook_id) ??
      (str(payload.event) ? str(payload.id) : null);
    if (bodyId) return bodyId.slice(0, 500);
  }
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

/** Keep tokens and auth headers out of the raw event log. */
export function safeHeaders(headers: Headers): Record<string, string> {
  const allowed = new Set([
    "api-signature",
    "api-timestamp",
    "content-type",
    "user-agent",
    "x-request-id",
    "x-housecall-event-id",
    "x-housecall-delivery-id",
    "x-webhook-id",
  ]);
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (allowed.has(key.toLowerCase())) out[key.toLowerCase()] = value;
  });
  return out;
}

export type DeliveryResult = {
  ok: boolean;
  duplicate?: boolean;
  inProgress?: boolean;
  eventId: string;
  status: WebhookStatus;
  counts?: SyncCounts;
  reconciliation?: ReconciliationResult;
  error?: string;
};

async function updateIntegration(orgId: string) {
  await sql`
    update integrations
    set status = 'CONNECTED', last_sync_at = now()
    where organization_id = ${orgId} and key = 'housecall_pro'`;
}

async function ensureFailureTask(
  orgId: string,
  event: Pick<WebhookEventRow, "id" | "provider_event_id" | "event_name" | "entity_type" | "entity_external_id">,
  error: string,
) {
  const label = [event.event_name, event.entity_type, event.entity_external_id]
    .filter(Boolean)
    .join(" · ") || event.provider_event_id;
  const title = `Resolve Housecall Pro webhook — ${label}`.slice(0, 200);
  await sql`
    insert into tasks (organization_id, title, detail, status, priority, due_at, origin)
    select ${orgId}, ${title},
           ${`A Housecall Pro delivery could not be processed: ${error} Open Ecosystem → Housecall Pro and replay it after the cause is fixed.`},
           'OPEN', 'HIGH', now(), 'HOUSECALL_WEBHOOK'
    where not exists (
      select 1 from tasks t
      where t.organization_id = ${orgId}
        and t.origin = 'HOUSECALL_WEBHOOK'
        and t.title = ${title}
        and t.status in ('OPEN', 'IN_PROGRESS')
    )`;
}

async function closeFailureTask(orgId: string, event: Pick<WebhookEventRow, "provider_event_id" | "event_name" | "entity_type" | "entity_external_id">) {
  const label = [event.event_name, event.entity_type, event.entity_external_id]
    .filter(Boolean)
    .join(" · ") || event.provider_event_id;
  const title = `Resolve Housecall Pro webhook — ${label}`.slice(0, 200);
  await sql`
    update tasks
    set status = 'DONE', completed_at = now()
    where organization_id = ${orgId} and origin = 'HOUSECALL_WEBHOOK'
      and title = ${title} and status in ('OPEN', 'IN_PROGRESS')`;
}

async function loadApiKey(orgId: string): Promise<string | null> {
  const [row] = (await sql`
    select api_key_enc from integrations
    where organization_id = ${orgId} and key = 'housecall_pro'`) as unknown as {
      api_key_enc: string | null;
    }[];
  const boxed = (row?.api_key_enc as string | null) ?? null;
  return boxed ? decryptSecret(boxed) : null;
}

async function runEvent(event: WebhookEventRow, payload: Json, orgId: string): Promise<DeliveryResult> {
  try {
    const counts = await ingestHousecallWebhook(orgId, payload);
    const apiKey = await loadApiKey(orgId);
    const reconciliation: ReconciliationResult = apiKey
      ? await reconcileHousecallEvent(orgId, apiKey, payload)
      : { attempted: false, applied: 0, skipped: "Housecall Pro API key is not connected; only the delivery snapshot was applied." };
    const touched = counts.customers + counts.jobs + counts.appointments + counts.invoices;
    const status: WebhookStatus = touched > 0 || reconciliation.attempted ? "PROCESSED" : "SKIPPED";
    if (touched > 0 || reconciliation.applied > 0) await updateIntegration(orgId);

    await sql`
      update housecall_webhook_events
      set status = ${status}, counts = ${sql.json(counts)}, reconciliation = ${sql.json(reconciliation)},
          processed_at = now(), last_error = ${reconciliation.error ?? null}
      where id = ${event.id} and organization_id = ${orgId}`;
    if (status === "PROCESSED") await closeFailureTask(orgId, event);
    return { ok: true, eventId: event.provider_event_id, status, counts, reconciliation };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sql`
      update housecall_webhook_events
      set status = 'FAILED', last_error = ${error.slice(0, 2000)}
      where id = ${event.id} and organization_id = ${orgId}`;
    await ensureFailureTask(orgId, event, error);
    return { ok: false, eventId: event.provider_event_id, status: "FAILED", error };
  }
}

async function claimEvent(orgId: string, eventId: string): Promise<WebhookEventRow | null> {
  const [row] = (await sql`
    update housecall_webhook_events
    set status = 'PROCESSING', attempts = attempts + 1, last_attempt_at = now()
    where organization_id = ${orgId} and provider_event_id = ${eventId}
      and status in ('RECEIVED', 'FAILED')
    returning *`) as unknown as WebhookEventRow[];
  return row ?? null;
}

export type DeliveryInput = {
  orgId: string;
  rawBody: string;
  headers: Headers;
  payload: Json;
  eventId: string;
  signatureStatus: SignatureStatus;
  signatureVerified: boolean;
};

function jsonStorageError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "22P05" || code === "22021" || (e instanceof Error && /unicode|json/i.test(e.message));
}

/** Persist a verified delivery, then process it. Duplicate event ids are
 *  acknowledged without re-applying; a previously failed/received event is
 *  retried in place so provider retries can recover. */
export async function acceptHousecallDelivery(input: DeliveryInput): Promise<DeliveryResult> {
  const entity = webhookEntity(input.payload);
  const eventName = dbText(webhookEventName(input.payload), 200);
  const occurred = dateOrNull(input.payload.event_occurred_at ?? input.payload.event_created_at);
  const companyId = dbText(input.payload.company_id, 200);

  const insertEvent = (payloadForDb: Json | null) => sql`
    insert into housecall_webhook_events
      (organization_id, provider_event_id, event_name, entity_type, entity_external_id, company_id,
       event_occurred_at, signature_status, signature_verified, status, raw_body, payload, headers)
    values (${input.orgId}, ${dbText(input.eventId, 500)}, ${eventName}, ${dbText(entity.type, 50)}, ${dbText(entity.externalId, 500)},
            ${companyId}, ${occurred}, ${input.signatureStatus}, ${input.signatureVerified},
            'RECEIVED', ${input.rawBody}, ${payloadForDb ? sql.json(payloadForDb as unknown as SqlJson) : null},
            ${sql.json(safeHeaders(input.headers))})
    on conflict (organization_id, provider_event_id) do nothing
    returning *`;

  let insertedRows: WebhookEventRow[];
  try {
    insertedRows = (await insertEvent(input.payload)) as unknown as WebhookEventRow[];
  } catch (e) {
    // JSONB rejects a NUL escape. Keep the raw delivery and let processing
    // surface the malformed field as a normal FAILED event instead of losing it.
    if (!jsonStorageError(e)) throw e;
    insertedRows = (await insertEvent(null)) as unknown as WebhookEventRow[];
  }
  const inserted = insertedRows[0];

  if (!inserted) {
    const [existing] = (await sql`
      select * from housecall_webhook_events
      where organization_id = ${input.orgId} and provider_event_id = ${input.eventId}
      limit 1`) as unknown as WebhookEventRow[];
    if (!existing) {
      return { ok: false, eventId: input.eventId, status: "FAILED", error: "The webhook event record disappeared." };
    }
    if (existing.status === "REJECTED") {
      return { ok: false, duplicate: true, eventId: input.eventId, status: "REJECTED", error: existing.last_error ?? "This delivery was rejected." };
    }
    if (existing.status === "PROCESSED" || existing.status === "SKIPPED") {
      return {
        ok: true, duplicate: true, eventId: input.eventId, status: existing.status,
        counts: existing.counts ?? undefined,
        reconciliation: existing.reconciliation ?? undefined,
      };
    }
    if (existing.status === "PROCESSING" && existing.last_attempt_at && Date.now() - new Date(existing.last_attempt_at).getTime() < 10 * 60_000) {
      return { ok: true, duplicate: true, inProgress: true, eventId: input.eventId, status: "PROCESSING" };
    }
    const claimed = await claimEvent(input.orgId, input.eventId);
    if (!claimed) {
      return { ok: true, duplicate: true, inProgress: true, eventId: input.eventId, status: "PROCESSING" };
    }
    return runEvent(claimed, input.payload, input.orgId);
  }

  const claimed = await claimEvent(input.orgId, input.eventId);
  if (!claimed) {
    return { ok: true, duplicate: true, inProgress: true, eventId: input.eventId, status: "PROCESSING" };
  }
  return runEvent(claimed, input.payload, input.orgId);
}

/** Record a delivery that cannot be processed (bad signature/JSON) so it is
 *  inspectable, but never expose its body as a replayable verified event. */
export async function rejectHousecallDelivery(input: {
  orgId: string;
  rawBody: string;
  headers: Headers;
  eventId: string;
  signatureStatus: SignatureStatus;
  error: string;
  payload?: Json | null;
}): Promise<void> {
  await sql`
    insert into housecall_webhook_events
      (organization_id, provider_event_id, event_name, entity_type, entity_external_id,
       signature_status, signature_verified, status, last_error, raw_body, payload, headers)
    values (${input.orgId}, ${dbText(input.eventId, 500)}, ${dbText(webhookEventName(input.payload ?? null), 200)},
            ${dbText(webhookEntity(input.payload ?? null).type, 50)}, ${dbText(webhookEntity(input.payload ?? null).externalId, 500)},
            ${input.signatureStatus}, ${input.signatureStatus === "VERIFIED"},
            'REJECTED', ${dbText(input.error, 2000)}, ${dbText(input.rawBody, 1_000_000)},
            ${input.payload ? sql.json(input.payload as unknown as SqlJson) : null}, ${sql.json(safeHeaders(input.headers))})
    on conflict (organization_id, provider_event_id) do nothing`;
}

/** Persist a delivery that failed before it could be claimed (for example a
 *  payload the database cannot serialize). The raw body is retained so the
 *  failure is visible and the provider's retry can attempt it again. */
export async function recordFailedHousecallDelivery(input: {
  orgId: string;
  rawBody: string;
  headers: Headers;
  eventId: string;
  signatureStatus: SignatureStatus;
  error: string;
  payload?: Json | null;
}): Promise<void> {
  const entity = webhookEntity(input.payload ?? null);
  const eventName = dbText(webhookEventName(input.payload ?? null), 200);
  const [row] = (await sql`
    insert into housecall_webhook_events
      (organization_id, provider_event_id, event_name, entity_type, entity_external_id,
       signature_status, signature_verified, status, last_error, raw_body, payload, headers)
    values (${input.orgId}, ${dbText(input.eventId, 500)}, ${eventName},
            ${dbText(entity.type, 50)}, ${dbText(entity.externalId, 500)}, ${input.signatureStatus},
            ${input.signatureStatus === "VERIFIED"}, 'FAILED', ${dbText(input.error, 2000)},
            ${dbText(input.rawBody, 1_000_000)}, null, ${sql.json(safeHeaders(input.headers))})
    on conflict (organization_id, provider_event_id) do nothing
    returning *`) as unknown as WebhookEventRow[];
  if (row) await ensureFailureTask(input.orgId, row, input.error);
}

/** Replay a stored event after a processing failure or a skipped entity. The
 *  signature is not re-checked here because it was checked on arrival; only
 *  verified (or token-only) events are eligible. */
export async function replayHousecallWebhookEvent(
  orgId: string,
  eventId: string,
  userId: string,
): Promise<DeliveryResult> {
  const [event] = (await sql`
    select * from housecall_webhook_events
    where id = ${eventId} and organization_id = ${orgId}
    limit 1`) as unknown as WebhookEventRow[];
  if (!event) return { ok: false, eventId, status: "FAILED", error: "Webhook event not found." };
  if (event.status === "REJECTED" || (!event.signature_verified && event.signature_status !== "NOT_CONFIGURED")) {
    return { ok: false, eventId: event.provider_event_id, status: "REJECTED", error: "Only verified or token-authenticated events can be replayed." };
  }
  const payload = jsonObject(event.payload) ?? (() => {
    try { return jsonObject(JSON.parse(event.raw_body)); } catch { return null; }
  })();
  if (!payload) return { ok: false, eventId: event.provider_event_id, status: "FAILED", error: "The stored event has no valid JSON payload." };

  const [claimed] = (await sql`
    update housecall_webhook_events
    set status = 'PROCESSING', attempts = attempts + 1, last_attempt_at = now(),
        replayed_at = now(), replayed_by = ${userId}, last_error = null
    where id = ${event.id} and organization_id = ${orgId} and status <> 'PROCESSING'
    returning *`) as unknown as WebhookEventRow[];
  if (!claimed) return { ok: false, eventId: event.provider_event_id, status: "PROCESSING", error: "That event is already being replayed." };

  const result = await runEvent(claimed, payload, orgId);
  await logAudit({
    organizationId: orgId,
    actorId: userId,
    action: "HOUSECALL_WEBHOOK_REPLAYED",
    targetType: "HousecallWebhookEvent",
    targetId: event.id,
    detail: `Replayed Housecall Pro ${event.event_name ?? "webhook"} event ${event.provider_event_id} — ${result.status}`,
    metadata: { eventId: event.provider_event_id, status: result.status, error: result.error ?? null },
  });
  return result;
}

export type HousecallWebhookLogItem = {
  id: string;
  providerEventId: string;
  eventName: string | null;
  entityType: string | null;
  entityExternalId: string | null;
  status: WebhookStatus;
  signatureStatus: SignatureStatus;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
  replayedAt: string | null;
  replayed: boolean;
};

export async function listHousecallWebhookEvents(orgId: string, limit = 12): Promise<HousecallWebhookLogItem[]> {
  const rows = (await sql`
    select id, provider_event_id, event_name, entity_type, entity_external_id, status, signature_status,
           attempts, last_error, received_at, processed_at, replayed_at
    from housecall_webhook_events
    where organization_id = ${orgId}
    order by received_at desc
    limit ${limit}`) as unknown as {
      id: string; provider_event_id: string; event_name: string | null; entity_type: string | null; entity_external_id: string | null;
      status: WebhookStatus; signature_status: SignatureStatus; attempts: number; last_error: string | null;
      received_at: Date; processed_at: Date | null; replayed_at: Date | null;
    }[];
  return rows.map((r) => ({
    id: String(r.id),
    providerEventId: r.provider_event_id,
    eventName: r.event_name,
    entityType: r.entity_type,
    entityExternalId: r.entity_external_id,
    status: r.status,
    signatureStatus: r.signature_status,
    attempts: r.attempts,
    lastError: r.last_error,
    receivedAt: new Date(r.received_at).toISOString(),
    processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
    replayedAt: r.replayed_at ? new Date(r.replayed_at).toISOString() : null,
    replayed: Boolean(r.replayed_at),
  }));
}
