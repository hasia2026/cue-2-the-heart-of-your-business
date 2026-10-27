// ReferPro webhook ingest — the free, no-money integration path.
// ReferPro (referral AI for the trades) POSTs campaign referral events here;
// each one lands as a Customer + a Pipeline lead tagged REFERPRO. Auth is the
// per-org webhook_secret on the integrations row (key='referpro') — Rotate it
// in the DB; ReferPro only needs this URL.
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { clientKey, rateLimitResult } from "@/lib/rate-limit";

export const runtime = "nodejs";

type ReferralEvent = {
  name: string | null;
  email: string | null;
  phone: string | null;
  campaign: string | null;
  referrer: string | null;
  note: string | null;
  estValue: number | null;
};

/**
 * Normalize an arbitrary ReferPro-shaped webhook body (flat object or a
 * events/referrals array) into referral events.
 */
function parseReferrals(b: Record<string, unknown>): ReferralEvent[] {
  const items = Array.isArray(b?.events) ? b.events
    : Array.isArray(b?.referrals) ? b.referrals
    : Array.isArray(b?.items) ? b.items
    : [b];
  const out: ReferralEvent[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    const o = raw ?? {};
    const name = (typeof o.name === "string" && o.name.trim()) ||
      (typeof o.customer_name === "string" && o.customer_name.trim()) ||
      (typeof o.referral_name === "string" && o.referral_name.trim())
      ? String(o.name ?? o.customer_name ?? o.referral_name).trim().slice(0, 120)
      : null;
    const email = typeof o.email === "string" && o.email.includes("@")
      ? o.email.trim().toLowerCase().slice(0, 200) : null;
    const phone = typeof o.phone === "string" && o.phone.trim()
      ? o.phone.trim().slice(0, 40) : null;
    if (!name && !email && !phone) continue; // nothing usable — never kill the batch
    const valueRaw = o.value ?? o.amount ?? o.estimated_value ?? o.job_value;
    const value = typeof valueRaw === "number" && Number.isFinite(valueRaw) ? Math.round(valueRaw * 100) / 100 : null;
    out.push({
      name,
      email,
      phone,
      campaign: typeof o.campaign === "string" ? o.campaign.trim().slice(0, 120) : null,
      referrer: typeof o.referrer === "string" ? o.referrer.trim().slice(0, 120)
        : typeof o.referred_by === "string" ? o.referred_by.trim().slice(0, 120) : null,
      note: typeof o.note === "string" || typeof o.message === "string"
        ? String(o.note ?? o.message).trim().slice(0, 500) : null,
      estValue: value,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  // URL-verification ping: a valid GET proves the endpoint + token to ReferPro
  // (or to anyone configuring it from the Ecosystem page).
  const token = req.nextUrl.searchParams.get("token");
  const [org] = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, org: org.name, integration: "referpro" });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });

  // 60 calls/min/IP blunts a runaway sender without affecting normal batches.
  const rl = rateLimitResult(clientKey(req, "ingest-referpro"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } });

  const token = req.headers.get("x-referpro-token") ?? req.nextUrl.searchParams.get("token");
  const [org] = await resolveOrg(token);
  if (!org) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = parseReferrals(body);
  if (!events.length) return NextResponse.json({ error: "No usable referral — name/email/phone required" }, { status: 400 });

  let createdCustomers = 0;
  let createdLeads = 0;
  let duplicates = 0;
  for (const ev of events.slice(0, 50)) {
    // Find or create the customer — by email, then by phone, within this org.
    let customerId: string | null = null;
    if (ev.email) {
      const [c] = await sql`select id from customers where organization_id = ${org.id} and lower(email) = ${ev.email}`;
      customerId = c?.id ?? null;
    }
    if (!customerId && ev.phone) {
      const [c] = await sql`select id from customers where organization_id = ${org.id} and replace(phone, ' ', '') = ${ev.phone.replace(/\s+/g, "")}`;
      customerId = c?.id ?? null;
    }
    if (!customerId) {
      const [c] = await sql`
        insert into customers (organization_id, name, email, phone, notes)
        values (${org.id}, ${ev.name ?? "Referral contact"}, ${ev.email}, ${ev.phone},
                ${ev.note ? `Referral note: ${ev.note}` : null})
        returning id`;
      customerId = c?.id ?? null;
      if (customerId) createdCustomers += 1;
    }

    if (!customerId) continue;
    // Dedup: an open REFERPRO lead for the same customer in the last 30 days
    // is a retry, not a new referral.
    const [dupe] = await sql`
      select id from leads
      where organization_id = ${org.id} and customer_id = ${customerId} and source = 'REFERPRO'
        and status not in ('WON','LOST') and created_at >= now() - interval '30 days'`;
    if (dupe) { duplicates += 1; continue; }

    const interest = [
      ev.campaign ? `campaign: ${ev.campaign}` : null,
      ev.referrer ? `referred by ${ev.referrer}` : null,
      ev.note,
    ].filter(Boolean).join(" — ") || "ReferPro referral";
    await sql`
      insert into leads (organization_id, customer_id, name, source, interest, est_value, status)
      values (${org.id}, ${customerId}, ${ev.name ?? "Referral contact"}, ${"REFERPRO"}, ${interest}, ${ev.estValue}, ${"NEW"})`;
    createdLeads += 1;
  }

  // Real traffic flips the integration to CONNECTED honestly — the badge
  // follows actual events, never a manual toggle.
  await sql`
    update integrations
    set status = ${"CONNECTED"}, last_sync_at = now()
    where organization_id = ${org.id} and key = ${"referpro"} and status <> ${"CONNECTED"}`;

  return NextResponse.json({ ok: true, leads: createdLeads, customers: createdCustomers, duplicates });
}

/** Shared token+org resolution for GET verification and POST ingest. */
async function resolveOrg(token: string | null): Promise<Array<{ id: string; name: string }>> {
  if (!token || token.length < 16) return [];
  const rows = (await sql`
    select o.id, o.name from integrations i join organizations o on o.id = i.organization_id
    where i.key = 'referpro' and i.webhook_secret = ${token}`) as unknown as Array<{ id: string; name: string }>;
  return rows;
}
