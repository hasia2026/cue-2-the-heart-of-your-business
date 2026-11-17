"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/secretbox";
import { syncHousecallPro, testHousecallPro } from "@/lib/housecall";

// Webhook tokens are bearer credentials: anyone holding the URL can post
// records into this org. They are never rendered into the page by default —
// reveal returns one on an explicit click, rotate replaces a leaked one.
const TOKEN_KEYS = new Set(["referpro", "webhook", "housecall_pro"]);
const TOKEN_WRITERS = new Set(["OWNER", "ADMIN", "MANAGER"]);

// Ingest path differs from the integration key for Housecall Pro (a stable,
// provider-named endpoint rather than the row key).
const INGEST_PATH: Record<string, string> = { housecall_pro: "housecall" };

const providerPath = (key: string) => INGEST_PATH[key] ?? key;

async function appOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3210";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Return the full ingest URL for the caller's org, on explicit request only. */
export async function revealWebhookUrl(
  key: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await requireSessionAction();
  if (!TOKEN_WRITERS.has(session.role)) {
    return { ok: false, error: "Only owners, admins and managers can view webhook tokens." };
  }
  if (!TOKEN_KEYS.has(key)) return { ok: false, error: "Unknown integration." };

  const [row] = await sql`
    select webhook_secret from integrations
    where organization_id = ${session.organizationId} and key = ${key}`;
  const secret = (row?.webhook_secret as string | null) ?? null;
  if (!secret) return { ok: false, error: "No token is set for this integration yet." };

  return { ok: true, url: `${await appOrigin()}/api/ingest/${providerPath(key)}?token=${secret}` };
}

/** Replace the token — the previous URL stops authenticating immediately. */
export async function rotateWebhookToken(
  key: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await requireSessionAction();
  if (!TOKEN_WRITERS.has(session.role)) {
    return { ok: false, error: "Only owners, admins and managers can rotate webhook tokens." };
  }
  if (!TOKEN_KEYS.has(key)) return { ok: false, error: "Unknown integration." };

  const [row] = await sql`
    update integrations set webhook_secret = gen_random_uuid()::text
    where organization_id = ${session.organizationId} and key = ${key}
    returning key, webhook_secret`;
  const secret = (row?.webhook_secret as string | null) ?? null;
  if (!secret) return { ok: false, error: "No token is set for this integration yet." };

  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "WEBHOOK_TOKEN_ROTATED",
    detail: `${key} webhook token rotated — the previous URL no longer authenticates`,
  });
  revalidatePath("/ecosystem");

  return { ok: true, url: `${await appOrigin()}/api/ingest/${providerPath(key)}?token=${secret}` };
}

/** Test + store a Housecall Pro company API key (encrypted at rest). */
export async function connectHousecallPro(
  apiKey: string,
): Promise<{ ok: boolean; error?: string; account?: string }> {
  const session = await requireSessionAction();
  if (!TOKEN_WRITERS.has(session.role)) {
    return { ok: false, error: "Only owners, admins and managers can connect Housecall Pro." };
  }
  const key = apiKey.trim();
  if (key.length < 10) return { ok: false, error: "Paste a Housecall Pro API key first." };

  const test = await testHousecallPro(key);
  if (!test.ok) return { ok: false, error: test.error ?? "Housecall Pro rejected that key." };

  await sql`
    insert into integrations (organization_id, key, name, category, status, api_key_enc, account_name, webhook_secret)
    values (${session.organizationId}, 'housecall_pro', 'Housecall Pro', 'FIELD_SERVICE', 'CONNECTED',
            ${encryptSecret(key)}, ${test.name ?? null}, gen_random_uuid()::text)
    on conflict (organization_id, key) do update set
      api_key_enc = excluded.api_key_enc,
      account_name = excluded.account_name,
      status = 'CONNECTED',
      webhook_secret = coalesce(integrations.webhook_secret, gen_random_uuid()::text)`;

  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "HOUSECALL_PRO_CONNECTED",
    detail: `Housecall Pro API key verified${test.name ? ` for ${test.name}` : ""}`,
  });
  revalidatePath("/ecosystem");
  revalidatePath("/field-ops");
  return { ok: true, account: test.name };
}

/** Pull customers, jobs and invoices now. Safe to run repeatedly — upserts. */
export async function syncHousecallProNow(): Promise<{
  ok: boolean;
  error?: string;
  counts?: { customers: number; jobs: number; appointments: number; invoices: number };
}> {
  const session = await requireSessionAction();
  if (!TOKEN_WRITERS.has(session.role)) {
    return { ok: false, error: "Only owners, admins and managers can sync Housecall Pro." };
  }
  const [row] = await sql`
    select api_key_enc from integrations
    where organization_id = ${session.organizationId} and key = 'housecall_pro'`;
  const boxed = (row?.api_key_enc as string | null) ?? null;
  if (!boxed) return { ok: false, error: "Connect Housecall Pro first — no API key is saved." };
  const key = decryptSecret(boxed);
  if (!key) return { ok: false, error: "The saved key could not be read. Reconnect Housecall Pro." };

  try {
    const counts = await syncHousecallPro(session.organizationId, key);
    await logAudit({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "HOUSECALL_PRO_SYNCED",
      detail: `Synced ${counts.customers} customers, ${counts.jobs} jobs, ${counts.appointments} appointments, ${counts.invoices} invoices`,
    });
    revalidatePath("/ecosystem");
    revalidatePath("/field-ops");
    revalidatePath("/pipeline");
    return { ok: true, counts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Housecall Pro sync failed." };
  }
}

export async function disconnectHousecallPro(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSessionAction();
  if (!TOKEN_WRITERS.has(session.role)) {
    return { ok: false, error: "Only owners, admins and managers can disconnect Housecall Pro." };
  }
  await sql`
    update integrations
    set api_key_enc = null, account_name = null, status = 'AVAILABLE'
    where organization_id = ${session.organizationId} and key = 'housecall_pro'`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "HOUSECALL_PRO_DISCONNECTED",
    detail: "Housecall Pro credentials removed; already-synced records remain in CUE",
  });
  revalidatePath("/ecosystem");
  revalidatePath("/field-ops");
  return { ok: true };
}
