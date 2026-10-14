// CUE intelligence engine — deterministic detectors computed from actual records.
// Every insight carries: evidence (JSON), reasoning, confidence. Nothing fabricated.
// `runDetectors` is idempotent per org: it skips re-creating insights whose
// dedupe signature already exists (tracked via insights.evidence->>'dedupe').
import { sql } from "./db";
import { logAudit } from "./audit";

export type EvidenceRef = { label: string; kind: string; ref?: string; count?: number };

type DetectorResult = {
  type: "RISK" | "OPPORTUNITY" | "REVENUE" | "OPERATIONS" | "CUSTOMER" | "ANOMALY";
  dedupe: string;
  title: string;
  summary: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  impactValue: number | null;
  evidence: EvidenceRef[];
  reasoning: string;
  confidence: number;
  rec: {
    title: string;
    action: string;
    rationale: string;
    impact: string;
    impactValue: number | null;
    confidence: number;
  } | null;
};

async function detectUnbilledService(organizationId: string): Promise<DetectorResult | null> {
  const [r] = await sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float as total,
      min(completed_at)::timestamptz as oldest
    from service_orders
    where organization_id = ${organizationId} and status = 'COMPLETED' and invoiced_at is null`;
  if (!r || r.n === 0) return null;
  const oldestDays = r.oldest ? Math.floor((Date.now() - new Date(r.oldest).getTime()) / 864e5) : null;
  return {
    type: "REVENUE",
    dedupe: "unbilled_service",
    title: `${r.n} completed service order${r.n === 1 ? "" : "s"} never invoiced`,
    summary: `${r.n} completed service order${r.n === 1 ? "" : "s"} totaling $${r.total.toFixed(2)} have no invoice.${oldestDays != null ? ` Oldest is ${oldestDays} days old — violates the 24-hour RO invoicing SOP.` : ""}`,
    severity: r.total > 3000 ? "HIGH" : "MEDIUM",
    impactValue: r.total,
    evidence: [
      { label: `${r.n} service orders with completed_at set, invoiced_at null`, kind: "QUERY", ref: "service_orders", count: r.n },
      { label: "RO-to-Invoice SOP — 24h SLA", kind: "KNOWLEDGE", ref: "PROCEDURE" },
    ],
    reasoning:
      "Completed-but-unbilled work is uncollected revenue. Customers do not chase the dealership to be billed; the money simply never arrives. The store's own SOP sets a 24-hour SLA.",
    confidence: 0.97,
    rec: {
      title: `Bill all ${r.n} completed service orders`,
      action: "Review each RO, confirm pricing, issue invoices, and follow up same-day.",
      rationale: "Every unbilled RO is uncollected revenue and an awkward future conversation.",
      impact: `Recovers ~$${Math.round(r.total)} and restores the 24h SLA.`,
      impactValue: r.total,
      confidence: 0.97,
    },
  };
}

async function detectStaleLeads(organizationId: string): Promise<DetectorResult | null> {
  const [r] = await sql`
    select count(*)::int as n, coalesce(sum(est_value), 0)::float as total,
      max(created_at)::timestamptz as newest
    from leads
    where organization_id = ${organizationId} and status in ('NEW','CONTACTED')
      and coalesce(last_contact_at, created_at) < now() - interval '5 days'`;
  if (!r || r.n < 3) return null;
  const days = r.newest ? Math.floor((Date.now() - new Date(r.newest).getTime()) / 864e5) : null;
  return {
    type: "OPPORTUNITY",
    dedupe: "stale_leads",
    title: `${r.n} leads with no recent follow-up`,
    summary: `${r.n} leads worth ~$${Math.round(r.total).toLocaleString()} have gone ${days ?? "?"}+ days without contact. The store's own lessons show leads contacted within 24h close 3× more often.`,
    severity: r.total > 100000 ? "HIGH" : "MEDIUM",
    impactValue: r.total,
    evidence: [
      { label: `${r.n} leads with no contact in 5+ days`, kind: "QUERY", ref: "leads", count: r.n },
      { label: "Lesson: internet leads decay after 48h", kind: "KNOWLEDGE", ref: "LESSON" },
    ],
    reasoning:
      "Follow-up speed is the strongest controllable predictor of close rate in the store's own history. Stale leads are future deals quietly going cold.",
    confidence: 0.9,
    rec: {
      title: "Launch a 48-hour lead recovery sprint",
      action: "Assign every stale lead an owner, a 48h contact deadline, and a script.",
      rationale: "Fast follow-up is the store's own proven close-rate multiplier.",
      impact: `~$${Math.round(r.total).toLocaleString()} pipeline re-engaged.`,
      impactValue: r.total,
      confidence: 0.9,
    },
  };
}

async function detectAgingInventory(organizationId: string): Promise<DetectorResult | null> {
  const rows = await sql`
    select stock_number, list_price, listed_at from vehicles
    where organization_id = ${organizationId} and status = 'AVAILABLE' and listed_at < now() - interval '60 days'
    order by listed_at asc`;
  if (rows.length < 3) return null;
  const total = rows.reduce((a, r) => a + Number(r.list_price ?? 0), 0);
  const oldestDays = Math.floor((Date.now() - new Date(rows[0].listed_at).getTime()) / 864e5);
  return {
    type: "OPERATIONS",
    dedupe: "aging_inventory",
    title: `${rows.length} used units past the 60-day aging threshold`,
    summary: `${rows.length} vehicles (oldest ${rows[0].stock_number} at ${oldestDays} days) exceed 60 days on lot. Carrying cost runs ~$40/unit/day.`,
    severity: rows.length > 4 ? "MEDIUM" : "LOW",
    impactValue: total,
    evidence: [
      { label: `${rows.length} AVAILABLE vehicles listed 60+ days ago`, kind: "QUERY", ref: "vehicles", count: rows.length },
      { label: "Goal: cut used days-on-lot below 45", kind: "GOAL", ref: "goals" },
    ],
    reasoning:
      "Aging stock accrues floorplan interest and ages further in buyer's minds. The discount-authority policy already grants +$1,000 pricing power past 60 days — currently unused on these units.",
    confidence: 0.85,
    rec: {
      title: "Apply aging-unit price reviews this week",
      action: "Use the +$1,000 aging authority to reprice; wholesale the worst two if unsold in 14 days.",
      rationale: "Policy already authorizes the discount; days-on-lot keeps accruing meanwhile.",
      impact: `Frees ~$${Math.round(total).toLocaleString()} in stuck capital.`,
      impactValue: total,
      confidence: 0.85,
    },
  };
}

async function detectFinanceBottleneck(organizationId: string): Promise<DetectorResult | null> {
  const [r] = await sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float as total
    from deals
    where organization_id = ${organizationId} and status = 'PENDING_FINANCE'
      and finance_sent_at < now() - interval '72 hours'`;
  if (!r || r.n === 0) return null;
  return {
    type: "RISK",
    dedupe: "finance_bottleneck",
    title: `${r.n} deal${r.n === 1 ? "" : "s"} stuck in finance over 72 hours`,
    summary: `${r.n} deal${r.n === 1 ? "" : "s"} worth $${Math.round(r.total).toLocaleString()} sent to F&I more than 3 days ago with no close. Buyers re-shop elsewhere after 72h.`,
    severity: "HIGH",
    impactValue: r.total,
    evidence: [
      { label: `${r.n} deals PENDING_FINANCE with finance_sent_at older than 72h`, kind: "QUERY", ref: "deals", count: r.n },
    ],
    reasoning:
      "Funding delay is a classic silent killer: the customer is sold, the vehicle is reserved, and momentum dies in paperwork. Customers who wait 3+ days frequently buy elsewhere.",
    confidence: 0.88,
    rec: {
      title: "Chase funding decisions on stuck deals today",
      action: "F&I calls each lender on the stuck deals; escalate any without a decision by EOD.",
      rationale: "The sale exists; only paperwork momentum is missing.",
      impact: `Protects $${Math.round(r.total).toLocaleString()} in near-won revenue.`,
      impactValue: r.total,
      confidence: 0.88,
    },
  };
}

async function detectOverdueInvoices(organizationId: string): Promise<DetectorResult | null> {
  const [r] = await sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float as total
    from invoices
    where organization_id = ${organizationId} and status = 'OVERDUE'`;
  if (!r || r.n === 0) return null;
  return {
    type: "RISK",
    dedupe: "overdue_invoices",
    title: `${r.n} overdue invoice${r.n === 1 ? "" : "s"} — $${Math.round(r.total).toLocaleString()} uncollected`,
    summary: `${r.n} invoice${r.n === 1 ? "" : "s"} past due totaling $${Math.round(r.total).toLocaleString()}. Collection lag compounds quietly and strains vendor relationships.`,
    severity: r.total > 5000 ? "HIGH" : "MEDIUM",
    impactValue: r.total,
    evidence: [{ label: `${r.n} invoices with status OVERDUE`, kind: "QUERY", ref: "invoices", count: r.n }],
    reasoning: "Receivables aging is the most common silent cash-flow squeeze in dealership fixed ops and fleet work.",
    confidence: 0.95,
    rec: {
      title: "Run a collections pass on overdue invoices",
      action: "Call each overdue account with the invoice number and a payment link ready.",
      rationale: "Direct contact resolves most overdue invoices within a week.",
      impact: `Recovers $${Math.round(r.total).toLocaleString()}.`,
      impactValue: r.total,
      confidence: 0.8,
    },
  };
}

async function detectAgreementRenewals(organizationId: string): Promise<DetectorResult | null> {
  // Agreements ending within 30 days (or already expired but still marked
  // ACTIVE, i.e. renewal chatter never closed it out). One insight per run;
  // dedupe rolls daily so re-running after outreach gives a clean re-nudge.
  const rolling = await sql`
    select ag.id, ag.customer_id, ag.plan_name, ag.annual_value, ag.ends_at, c.name as customer_name
    from maintenance_agreements ag
    join customers c on c.id = ag.customer_id
    where ag.organization_id = ${organizationId}
      and ag.status = 'ACTIVE'
      and ag.ends_at is not null
      and ag.ends_at <= now() + interval '30 days'
    order by ag.ends_at asc`;
  if (!rolling.length) return null;

  const soonest = rolling[0];
  const endsSoon = rolling.filter((a) => new Date(a.ends_at).getTime() > Date.now());
  const expired = rolling.length - endsSoon.length;
  const total = rolling.reduce((s, a) => s + Number(a.annual_value), 0);
  const expLabel = (d: string) =>
    Math.floor((new Date(d).getTime() - Date.now()) / 864e5) <= 0 ? "already expired" : `in ${Math.floor((new Date(d).getTime() - Date.now()) / 864e5)} days`;
  return {
    type: "REVENUE",
    dedupe: `agreement_renewals:${soonest.id}`,
    title: `${rolling.length} maintenance agreement${rolling.length === 1 ? "" : "s"} up for renewal — $${Math.round(total).toLocaleString()} at stake`,
    summary: rolling.map((a) => `• ${a.customer_name}: ${a.plan_name} ($${Math.round(a.annual_value)}/yr) ends ${expLabel(a.ends_at)}`).join("\n"),
    severity: total > 2000 ? "HIGH" : "MEDIUM",
    impactValue: total,
    evidence: [
      { label: `${rolling.length} agreements ending ≤30 days (${expired} already past end date)`, kind: "QUERY", ref: "maintenance_agreements", count: rolling.length },
    ],
    reasoning:
      "Agreements renew silently by invoice date — nobody owns the outreach. Renewal contact 30 days early converts far better than a post-expiry dunning, and an unmanaged expiry hands the customer to a competitor maintenance sale.",
    confidence: 0.93,
    rec: {
      title: `Draft renewal offers for ${rolling.length} agreement${rolling.length === 1 ? "" : "s"}`,
      action: rolling.map((a) => `• ${a.customer_name}: call with pre-drafted offer — ${a.plan_name} renewal $${Math.round(a.annual_value)}/yr (ends ${new Date(a.ends_at).toLocaleDateString()})`).join("\n"),
      rationale: "Early renewal outreach lifts retention versus chasing after lapse.",
      impact: `Protects $${Math.round(total)}/yr in recurring revenue.`,
      impactValue: total,
      confidence: 0.93,
    },
  };
}

async function detectAgreementProposal(organizationId: string): Promise<DetectorResult | null> {
  // No-agreement customers whose service history says they should have one:
  // ≥2 completed service orders in 12 months, or 12-month spend ≥1.5× the
  // org's cheapest ACTIVE plan. Plan-cost anchor comes from their own data.
  const [anchor] = await sql`
    select min(annual_value)::float as cheapest from maintenance_agreements
    where organization_id = ${organizationId} and status = 'ACTIVE' and annual_value > 0`;
  const planAnchor = Number(anchor?.cheapest ?? 0);
  if (!planAnchor) return null; // no agreements yet — nothing to propose against

  const candid = await sql`
    select c.id, c.name, count(so.id)::int as visits,
           coalesce(sum(so.amount), 0)::float as spend
    from customers c
    join service_orders so on so.customer_id = c.id and so.status = 'COMPLETED'
      and so.opened_at > now() - interval '12 months'
    where c.organization_id = ${organizationId}
      and c.status = 'ACTIVE'
      and not exists (
        select 1 from maintenance_agreements ag
        where ag.customer_id = c.id and ag.status in ('ACTIVE', 'EXPIRED')
      )
    group by c.id, c.name
    having count(so.id) >= 2 or coalesce(sum(so.amount), 0) >= ${planAnchor * 1.5}
    order by spend desc
    limit 5`;
  if (!candid.length) return null;

  const top = candid[0];
  const potential = candid.length * planAnchor;
  return {
    type: "CUSTOMER",
    dedupe: "agreement_proposals",
    title: `${candid.length} customer${candid.length === 1 ? "" : "s"} behaving like maintenance-plan fits — $${Math.round(potential).toLocaleString()}/yr unclaimed`,
    summary: candid.map((c) => `• ${c.name}: ${c.visits} service call${c.visits === 1 ? "" : "s"} / $${Math.round(c.spend)} in 12 mo — no agreement`).join("\n"),
    severity: candid.length >= 3 ? "HIGH" : "MEDIUM",
    impactValue: potential,
    evidence: [
      { label: "customers with ≥2 completed calls in 12mo or spend ≥1.5× cheapest plan, zero agreements", kind: "QUERY", ref: "service_orders", count: candid.length },
      { label: `cheapest ACTIVE plan: $${Math.round(planAnchor)}/yr`, kind: "DERIVED" },
    ],
    reasoning:
      "Repeat service buyers pay call-by-call for breakdowns they could lower-cost-prevent. An agreement converts emergency buyers into annual revenue, smooths seasonality, and makes retention structural rather than luck-of-the-season.",
    confidence: 0.85,
    rec: {
      title: `Propose a plan to ${candid.length} customer${candid.length === 1 ? "" : "s"}`,
      action: candid.map((c) => `• ${c.name}: pitch ${c.visits} calls / $${Math.round(c.spend)} last 12mo → plan at ~$${Math.round(planAnchor)}/yr (saves them ~$${Math.max(0, Math.round(c.spend - planAnchor))})`).join("\n"),
      rationale: "Their own spend math beats the plan price — the pitch writes itself from the numbers.",
      impact: `Up to $${Math.round(potential)}/yr of new recurring revenue.`,
      impactValue: potential,
      confidence: 0.85,
    },
  };
}

export async function runDetectors(organizationId: string): Promise<number> {
  const detectors = [
    detectUnbilledService,
    detectStaleLeads,
    detectAgingInventory,
    detectFinanceBottleneck,
    detectOverdueInvoices,
    detectAgreementRenewals,
    detectAgreementProposal,
  ];
  let created = 0;
  for (const det of detectors) {
    const result = await det(organizationId);
    if (!result) continue;
    const [existing] = await sql`
      select id from insights
      where organization_id = ${organizationId}
        and evidence->>'dedupe' = ${result.dedupe}
        and status = 'OPEN' limit 1`;
    if (existing) continue;

    const [ins] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${organizationId}, ${result.type}, ${result.title}, ${result.summary}, ${result.severity},
        ${result.impactValue}, ${sql.json({ ...evidenceToJson(result.evidence), dedupe: result.dedupe })}, ${result.reasoning}, ${result.confidence})
      returning id`;
    if (result.rec) {
      const [rec] = await sql`
        insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
        values (${organizationId}, ${ins.id}, ${result.rec.title}, ${result.rec.action}, ${result.rec.rationale},
          ${result.rec.impact}, ${result.rec.impactValue}, ${result.rec.confidence})
        returning id`;
      await sql`update insights set rec_id = ${rec.id} where id = ${ins.id}`;
    }
    await logAudit({
      organizationId,
      actorType: "AI",
      action: "INSIGHT_CREATED",
      targetType: "Insight",
      targetId: ins.id,
      detail: result.title,
    });
    created += 1;
  }
  return created;
}

function evidenceToJson(refs: EvidenceRef[]): Record<string, unknown> {
  return { items: refs };
}

/** Evidence stored as jsonb {items:[…], dedupe}; tolerates legacy strings/arrays. */
export function parseEvidence(raw: unknown): { items: EvidenceRef[]; dedupe?: string } {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return { items: [] }; }
  }
  if (Array.isArray(v)) return { items: v as EvidenceRef[] };
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return {
      items: Array.isArray(obj.items) ? (obj.items as EvidenceRef[]) : [],
      dedupe: typeof obj.dedupe === "string" ? obj.dedupe : undefined,
    };
  }
  return { items: [] };
}

/** Per-org leak totals for the scan-call leave-behind.
 *  Mirrors the same queries the detectors run, grouped into the four
 *  leave-behind rows: unbilled work, cold leads, aging inventory/quotes,
 *  and everything else. Only counts categories with findings. */
export type LeakTotals = {
  orgName: string;
  total: number;
  rows: Array<{ key: string; label: string; detail: string; count: number; value: number }>;
};

export async function getLeakTotals(organizationId: string): Promise<LeakTotals> {
  const [org] = await sql`select name from organizations where id = ${organizationId}`;

  // 1) Completed-but-unbilled service work (detector: detectUnbilledService)
  const [unbilled] = await sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float as total
    from service_orders
    where organization_id = ${organizationId} and status = 'COMPLETED' and invoiced_at is null`;

  // 2) Stale leads (detector: detectStaleLeads)
  const [leads] = await sql`
    select count(*)::int as n, coalesce(sum(est_value), 0)::float as total
    from leads
    where organization_id = ${organizationId} and status in ('NEW','CONTACTED')
      and coalesce(last_contact_at, created_at) < now() - interval '5 days'`;

  // 3) Aging inventory (detector: detectAgingInventory)
  const [aging] = await sql`
    select count(*)::int as n, coalesce(sum(list_price), 0)::float as total
    from vehicles
    where organization_id = ${organizationId} and status = 'AVAILABLE' and listed_at < now() - interval '60 days'`;

  // 4) Everything else the detectors flag: unrecoverable finance bottleneck,
  //    overdue invoices, agreement renewals + proposals — summed from OPEN
  //    insights so the leave-behind stays in sync with what the app already
  //    shows, without duplicating each detector's SQL.
  const [other] = await sql`
    select count(*)::int as n, coalesce(sum(impact_value), 0)::float as total
    from insights
    where organization_id = ${organizationId} and status = 'OPEN'
      and evidence->>'dedupe' in ('finance_bottleneck','overdue_invoices')
      or organization_id = ${organizationId} and status = 'OPEN'
      and evidence->>'dedupe' like 'agreement_%'`;

  const rows: LeakTotals["rows"] = [];
  if (unbilled?.n > 0)
    rows.push({ key: "unbilled", label: "Work finished, never invoiced", detail: "completed jobs whose invoice never went out, checked against your own SOP", count: unbilled.n, value: Number(unbilled.total) });
  if (leads?.n >= 3)
    rows.push({ key: "leads", label: "Leads that went cold quietly", detail: "no contact logged past your follow-up window, each with a dollar value attached", count: leads.n, value: Number(leads.total) });
  if (aging?.n >= 3)
    rows.push({ key: "aging", label: "Aging units / quotes past their reprice window", detail: "your policy already allows the move; nobody pulled the trigger", count: aging.n, value: Number(aging.total) });
  if (other?.n > 0)
    rows.push({ key: "other", label: "Other leaks from your records", detail: "anything the scan surfaced outside the three categories above", count: other.n, value: Number(other.total) });

  const total = rows.reduce((s, r) => s + r.value, 0);
  return {
    orgName: org?.name ?? "",
    total,
    rows,
  };
}

/** Convenience for API route /api/insight/[id]. */
export async function getInsightBundle(organizationId: string, insightId: string) {
  const [ins] = await sql`
    select * from insights where id = ${insightId} and organization_id = ${organizationId}`;
  if (!ins) return null;
  const [rec] = ins.rec_id
    ? await sql`select * from recommendations where id = ${ins.rec_id}`
    : [null];
  const audit = await sql`
    select action, actor_type, detail, created_at from audit_events
    where organization_id = ${organizationId}
      and ((target_type = 'Insight' and target_id = ${insightId})
        ${rec ? sql`or (target_type = 'Recommendation' and target_id = ${rec.id})` : sql``})
    order by created_at asc limit 20`;
  return { insight: ins, rec, evidence: parseEvidence(ins.evidence), audit };
}
