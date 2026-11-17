// Housecall Pro webhook receiver — one secret URL per org.
//
// Configure it from Ecosystem → Housecall Pro (reveal the URL, paste it into
// Housecall Pro's webhook settings). Auth is the per-org token in the URL or
// `x-cue-housecall`; the token is the password, so it is never rendered on the
// page until an owner explicitly reveals it.
//
// Accepts the documented event envelopes (`{ event, job|invoice|customer }`)
// plus a bare entity, and normalizes everything into the same customers /
// service_orders / invoices rows the pull sync writes.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";
import { ingestHousecallWebhook } from "@/lib/housecall";

export const runtime = "nodejs";

async function resolveOrg(token: string | null): Promise<{ id: string; name: string } | null> {
  if (!token || token.length < 16) return null;
  const [org] = (await sql`
    select o.id, o.name from integrations i join organizations o on o.id = i.organization_id
    where i.key = 'housecall_pro' and i.webhook_secret = ${token}
    limit 1`) as unknown as { id: string; name: string }[];
  return org ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-cue-housecall") ?? req.nextUrl.searchParams.get("token");
  const org = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, org: org.name, integration: "housecall_pro" });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  const rl = rateLimitResult(clientKey(req, "ingest-housecall"), 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } });

  const token = req.headers.get("x-cue-housecall") ?? req.nextUrl.searchParams.get("token");
  const org = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const counts = await ingestHousecallWebhook(org.id, body);
    const touched = counts.customers + counts.jobs + counts.appointments + counts.invoices;
    if (touched > 0) {
      await sql`
        update integrations
        set status = 'CONNECTED', last_sync_at = now()
        where organization_id = ${org.id} and key = 'housecall_pro'`;
    }
    return NextResponse.json({ ok: true, org: org.name, ...counts });
  } catch (e) {
    console.error("housecall webhook handler error", e);
    return NextResponse.json({ error: "Could not normalize that event" }, { status: 422 });
  }
}