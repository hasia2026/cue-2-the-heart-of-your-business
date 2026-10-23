"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { signalHash } from "@/lib/market-signals";

// Market Signals actions — every mutation is org-scoped (id + organization_id
// together in the WHERE clause; never trust the id alone) and flips the
// signal's status so converting twice is impossible.

type Loaded = {
  id: string;
  organizationId: string;
  kind: string;
  source: string;
  channel: string | null;
  title: string;
  body: string | null;
  url: string | null;
  author: string | null;
};

async function loadFreshSignal(id: string, orgId: string): Promise<Loaded | null> {
  const rows = await sql`
    select id, organization_id as "organizationId", kind, source, channel, title, body, url, author
    from market_signals
    where id = ${id} and organization_id = ${orgId} and status = 'NEW'`;
  const s = rows[0] as Loaded | undefined;
  return s ?? null;
}

const label = (s: Loaded) => `${s.channel ?? s.source}${s.author ? ` — ${s.author}` : ""}`;

export async function convertSignalToLead(formData: FormData): Promise<void> {
  const session = await requireSessionAction();
  const signalId = String(formData.get("signalId") ?? "");
  if (!signalId) return;
  const s = await loadFreshSignal(signalId, session.organizationId);
  if (!s) return;

  const inserted = await sql`
    insert into leads (organization_id, name, source, interest, status)
    values (${s.organizationId}, ${s.author || s.title}, ${s.kind === "GBP" ? "GBP" : "MARKET"},
            ${s.title}, 'NEW')
    returning id`;
  const lead = { id: (inserted[0] as { id: string }).id };
  await sql`update market_signals set status = 'LEAD', lead_id = ${lead.id}
    where id = ${s.id} and organization_id = ${s.organizationId}`;
  await logAudit({
    organizationId: s.organizationId,
    actorId: session.user.id,
    action: "SIGNAL_CONVERT_LEAD",
    targetType: "market_signal",
    targetId: s.id,
    detail: `${label(s)} → lead ${lead.id}`,
  });
  revalidatePath("/signals");
  revalidatePath("/pipeline");
}

export async function convertSignalToInsight(formData: FormData): Promise<void> {
  const session = await requireSessionAction();
  const signalId = String(formData.get("signalId") ?? "");
  if (!signalId) return;
  const s = await loadFreshSignal(signalId, session.organizationId);
  if (!s) return;

  const summary = (s.body?.trim() || s.title).slice(0, 1000);
  const inserted = await sql`
    insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence, status)
    values (${s.organizationId}, 'OPPORTUNITY', ${s.title}, ${summary}, 'MEDIUM', null,
      ${JSON.stringify([{ source: s.source, channel: s.channel, author: s.author, url: s.url }])},
      ${`Inbound market signal received via ${s.source} and converted to an insight by a signed-in owner.`},
      0.8, 'OPEN')
    returning id`;
  const insight = { id: (inserted[0] as { id: string }).id };
  await sql`update market_signals set status = 'INSIGHT', insight_id = ${insight.id}
    where id = ${s.id} and organization_id = ${s.organizationId}`;
  await logAudit({
    organizationId: s.organizationId,
    actorId: session.user.id,
    action: "SIGNAL_CONVERT_INSIGHT",
    targetType: "market_signal",
    targetId: s.id,
    detail: `${label(s)} → insight ${insight.id}`,
  });
  revalidatePath("/signals");
  revalidatePath("/understand");
}

export async function dismissSignal(formData: FormData): Promise<void> {
  const session = await requireSessionAction();
  const signalId = String(formData.get("signalId") ?? "");
  if (!signalId) return;
  await sql`update market_signals set status = 'DISMISSED'
    where id = ${signalId} and organization_id = ${session.organizationId} and status = 'NEW'`;
  await logAudit({
    organizationId: session.organizationId,
    actorId: session.user.id,
    action: "SIGNAL_DISMISS",
    targetType: "market_signal",
    targetId: signalId,
  });
  revalidatePath("/signals");
}

// Three realistic, clearly-flagged demo signals so the page, badges and
// conversion flow are explorable before a provider is connected. Inserted
// with the same per-org signal_hash scheme, so re-clicking is a no-op.
export async function addDemoSignals(): Promise<void> {
  const session = await requireSessionAction();
  const orgId = session.organizationId;
  const now = Date.now();
  const demo = [
    {
      title: "Neighbor asks who the best air conditioning company is around here",
      body: "Getting quotes next week — who do you all recommend for a full system install?",
      author: "@MapsNeighbor",
      channel: "FACEBOOK",
      intentHint: "BUY",
    },
    {
      title: "Looking to trade my 2021 Tahoe before summer road trips",
      body: "Want an estimate on trade-in value this month if possible.",
      author: "Dana R.",
      channel: "GBP",
      intentHint: "SELL",
    },
    {
      title: "AC stopped cooling after the storm — need help fast",
      body: "Heard clicking and now it's blowing warm. Repair or replace opinion welcome.",
      author: "@HVACHelpMe",
      channel: "X",
      intentHint: "SERVICE",
    },
  ] as const;
  let i = 0;
  for (const d of demo) {
    i += 1;
    const hash = signalHash(orgId, {
      kind: d.channel === "GBP" ? "GBP" : "SOCIAL",
      source: "DEMO",
      externalId: `demo-${orgId.slice(0, 8)}-${i}`,
      author: d.author ?? "",
      title: d.title,
      body: d.body,
    });
    await sql`
      insert into market_signals
        (organization_id, kind, source, external_id, author, channel, title, body, intent, signal_hash, demo, occurred_at)
      values
        (${orgId}, ${d.channel === "GBP" ? "GBP" : "SOCIAL"}, 'DEMO', ${`demo-${orgId.slice(0, 8)}-${i}`},
         ${d.author}, ${d.channel}, ${d.title}, ${d.body}, ${d.intentHint}, ${hash}, true,
         ${new Date(now - i * 3600_000)})
      on conflict (organization_id, signal_hash) do nothing`;
  }
  await logAudit({ organizationId: orgId, actorId: session.user.id, action: "SIGNAL_DEMO_SEED", detail: "3 demo signals added" });
  revalidatePath("/signals");
}
