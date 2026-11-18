// Housecall Pro webhook receiver — one secret URL per org.
//
// Configure it from Ecosystem → Housecall Pro (reveal the URL, paste it into
// Housecall Pro's webhook settings), then save the signing secret HCP returns.
// The per-org URL token remains the routing/auth fallback; once a signing
// secret is saved, every delivery must also pass Api-Timestamp/Api-Signature
// HMAC verification over the raw body.
//
// Every delivery is persisted before normalization so retries can be deduped,
// failures can be inspected, and a failed/skipped event can be replayed without
// asking Housecall Pro to resend it.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";
import { decryptSecret } from "@/lib/secretbox";
import {
  acceptHousecallDelivery,
  recordFailedHousecallDelivery,
  rejectHousecallDelivery,
  verifyHousecallSignature,
  webhookEventId,
} from "@/lib/housecall-webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

type ResolvedOrg = { id: string; name: string; signingSecretEnc: string | null };

async function resolveOrg(token: string | null): Promise<ResolvedOrg | null> {
  if (!token || token.length < 16) return null;
  const [org] = (await sql`
    select o.id, o.name, i.webhook_signing_secret_enc
    from integrations i join organizations o on o.id = i.organization_id
    where i.key = 'housecall_pro' and i.webhook_secret = ${token}
    limit 1`) as unknown as { id: string; name: string; webhook_signing_secret_enc: string | null }[];
  if (!org) return null;
  return { id: org.id, name: org.name, signingSecretEnc: org.webhook_signing_secret_enc };
}

function tokenFrom(req: NextRequest): string | null {
  return req.headers.get("x-cue-housecall") ?? req.nextUrl.searchParams.get("token");
}

export async function GET(req: NextRequest) {
  const org = await resolveOrg(tokenFrom(req));
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, org: org.name, integration: "housecall_pro" });
}

export async function POST(req: NextRequest) {
  const rl = rateLimitResult(clientKey(req, "ingest-housecall"), 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }

  const org = await resolveOrg(tokenFrom(req));
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Signature verification must use the exact bytes HCP signed.
  const rawBody = await req.text();
  if (!rawBody) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  if (rawBody.length > 1_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signingSecret = org.signingSecretEnc ? decryptSecret(org.signingSecretEnc) : null;
  const signature = verifyHousecallSignature(
    rawBody,
    req.headers.get("api-timestamp"),
    req.headers.get("api-signature"),
    signingSecret,
    Boolean(org.signingSecretEnc),
  );

  if (!signature.ok) {
    const eventId = webhookEventId(req.headers, null, rawBody);
    try {
      await rejectHousecallDelivery({
        orgId: org.id,
        rawBody,
        headers: req.headers,
        eventId,
        signatureStatus: signature.status,
        error: signature.error ?? "Signature verification failed.",
      });
    } catch (e) {
      console.error("housecall rejected-event log failed", e);
    }
    return NextResponse.json(
      { error: signature.error ?? "Signature verification failed." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const eventId = webhookEventId(req.headers, null, rawBody);
    try {
      await rejectHousecallDelivery({
        orgId: org.id,
        rawBody,
        headers: req.headers,
        eventId,
        signatureStatus: signature.status,
        error: "The request body is not valid JSON.",
      });
    } catch (e) {
      console.error("housecall rejected-event log failed", e);
    }
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const eventId = webhookEventId(req.headers, payload, rawBody);
  try {
    const result = await acceptHousecallDelivery({
      orgId: org.id,
      rawBody,
      headers: req.headers,
      payload,
      eventId,
      signatureStatus: signature.status,
      signatureVerified: signature.status === "VERIFIED",
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, org: org.name, eventId, status: result.status, error: result.error },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        org: org.name,
        eventId,
        status: result.status,
        duplicate: result.duplicate ?? false,
        inProgress: result.inProgress ?? false,
        ...(result.counts ?? {}),
        ...(result.reconciliation ? { reconciliation: result.reconciliation } : {}),
      },
      { status: result.inProgress ? 202 : 200 },
    );
  } catch (e) {
    console.error("housecall webhook handler error", e);
    const error = e instanceof Error ? e.message : "Could not persist or normalize that event";
    try {
      await recordFailedHousecallDelivery({
        orgId: org.id,
        rawBody,
        headers: req.headers,
        eventId,
        signatureStatus: signature.status,
        error,
        payload,
      });
    } catch (logError) {
      console.error("housecall failed-event log failed", logError);
    }
    return NextResponse.json(
      { ok: false, eventId, error: "Could not persist or normalize that event" },
      { status: 500 },
    );
  }
}
