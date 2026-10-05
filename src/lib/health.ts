// Business Health — deterministic, explainable, computed from actual records.
// Not scientific: every dimension returns score → evidence → reasoning → confidence.
import { sql } from "./db";

export type Dimension = {
  key: string;
  label: string;
  score: number; // 0-100
  evidence: string;
  reasoning: string;
  confidence: number; // 0-1
};

export type Health = {
  overall: number;
  grade: "HEALTHY" | "WATCH" | "AT_RISK";
  dataQuality: number; // % of dimensions with enough data to score
  dimensions: Dimension[];
  computedAt: string;
};

type OrgCounts = {
  customers: number;
  vehicles: number;
  deals: number;
  serviceOrders: number;
  invoices: number;
  leads: number;
  employees: number;
  documents: number;
  knowledgeItems: number;
};

async function counts(organizationId: string): Promise<OrgCounts> {
  const [r] = await sql`
    select
      (select count(*) from customers where organization_id = ${organizationId})::int as customers,
      (select count(*) from vehicles where organization_id = ${organizationId})::int as vehicles,
      (select count(*) from deals where organization_id = ${organizationId})::int as deals,
      (select count(*) from service_orders where organization_id = ${organizationId})::int as "serviceOrders",
      (select count(*) from invoices where organization_id = ${organizationId})::int as invoices,
      (select count(*) from leads where organization_id = ${organizationId})::int as leads,
      (select count(*) from employees where organization_id = ${organizationId})::int as employees,
      (select count(*) from documents where organization_id = ${organizationId})::int as documents,
      (select count(*) from knowledge_items where organization_id = ${organizationId})::int as "knowledgeItems"`;
  return r as unknown as OrgCounts;
}

export async function computeHealth(organizationId: string): Promise<Health> {
  const c = await counts(organizationId);
  const dims: Dimension[] = [];
  const push = (key: string, label: string, score: number | null, evidence: string, reasoning: string, confidence: number) => {
    dims.push({
      key,
      label,
      score: score == null ? 50 : Math.max(0, Math.min(100, Math.round(score))),
      evidence,
      reasoning,
      confidence,
    });
  };

  // Revenue: invoice collection health
  if (c.invoices > 0) {
    const [inv] = await sql`
      select
        count(*)::int as total,
        sum(case when status = 'PAID' then 1 else 0 end)::int as paid,
        sum(case when status = 'OVERDUE' then 1 else 0 end)::int as overdue,
        coalesce(sum(case when status = 'PAID' then amount else 0 end), 0)::float as collected
      from invoices where organization_id = ${organizationId}`;
    const rate = inv.total ? inv.paid / inv.total : 0;
    const score = 100 * rate - (inv.overdue ?? 0) * 5;
    push("revenue", "Revenue", score,
      `${inv.paid}/${inv.total} invoices paid; ${inv.overdue ?? 0} overdue; $${Math.round(inv.collected)} collected.`,
      "Collection rate drives the score; each overdue invoice subtracts.", 0.9);
  } else {
    push("revenue", "Revenue", null, "No invoices recorded yet.", "Score neutral until billing data exists.", 0.2);
  }

  // Sales pipeline: deal velocity + lead freshness
  if (c.deals > 0 || c.leads > 0) {
    const [d] = await sql`
      select
        sum(case when status = 'WON' then 1 else 0 end)::int as won,
        sum(case when status = 'PENDING_FINANCE' then 1 else 0 end)::int as pending,
        sum(case when status in ('NEGOTIATING','PENDING_FINANCE') then amount else 0 end)::float as activeValue,
        (select count(*) from leads where organization_id = ${organizationId} and status = 'NEW' and created_at < now() - interval '7 days')::int as staleLeads
      from deals where organization_id = ${organizationId}`;
    const stale = d.staleLeads ?? 0;
    const score = 55 + (d.won ?? 0) * 6 - stale * 4 - (d.pending ?? 0) * 2 + Math.min(15, (d.activeValue ?? 0) / 20000);
    push("pipeline", "Sales pipeline", score,
      `${d.won ?? 0} won · ${d.pending ?? 0} in finance · $${Math.round(d.activeValue ?? 0)} active · ${stale} stale leads (>7d untouched).`,
      "Won deals raise it; untouched leads and stuck finance deals lower it.", 0.75);
  } else {
    push("pipeline", "Sales pipeline", null, "No deals or leads recorded yet.", "Neutral until sales data exists.", 0.2);
  }

  // Operations: service billing discipline (dealership fixed-ops proxy)
  if (c.serviceOrders > 0) {
    const [s] = await sql`
      select
        count(*)::int as total,
        sum(case when status = 'COMPLETED' and invoiced_at is null then 1 else 0 end)::int as unbilled,
        coalesce(sum(case when status = 'COMPLETED' and invoiced_at is null then amount else 0 end), 0)::float as unbilledValue,
        avg(case when completed_at is not null and invoiced_at is not null then extract(epoch from (invoiced_at - completed_at))/3600 end)::float as avgBillHours
      from service_orders where organization_id = ${organizationId}`;
    const unbilled = s.unbilled ?? 0;
    const billPenalty = s.avgBillHours != null ? Math.min(30, s.avgBillHours) : 10;
    const score = 90 - unbilled * 8 - billPenalty;
    push("operations", "Operations", score,
      `${s.total} service orders · ${unbilled} completed-but-unbilled ($${Math.round(s.unbilledValue ?? 0)}) · avg billing lag ${s.avgBillHours ? s.avgBillHours.toFixed(1) + "h" : "n/a"}.`,
      "Unbilled completed work and slow billing directly reduce the score.", 0.9);
  } else {
    push("operations", "Operations", null, "No service orders recorded yet.", "Neutral until fixed-ops data exists.", 0.2);
  }

  // Inventory health (dealership): aging stock
  if (c.vehicles > 0) {
    const [v] = await sql`
      select count(*)::int as available,
        sum(case when listed_at < now() - interval '60 days' then 1 else 0 end)::int as aging,
        coalesce(sum(case when listed_at < now() - interval '60 days' then list_price else 0 end), 0)::float as agingValue
      from vehicles where organization_id = ${organizationId} and status = 'AVAILABLE'`;
    const aging = v.aging ?? 0;
    const ratio = v.available ? aging / v.available : 0;
    const score = 90 - ratio * 60 - aging * 2;
    push("inventory", "Inventory", score,
      `${v.available} available units · ${aging} past 60 days on lot ($${Math.round(v.agingValue ?? 0)}).`,
      "Aging stock ties up floorplan capital; ratio drives the score.", 0.8);
  } else {
    push("inventory", "Inventory", null, "No vehicles recorded yet.", "Neutral until inventory data exists.", 0.2);
  }

  // Customers: base growth + overdue receivables
  if (c.customers > 0) {
    const [cu] = await sql`
      select count(*)::int as total,
        (select count(*) from communications where organization_id = ${organizationId})::int as touches,
        (select count(*) from invoices where organization_id = ${organizationId} and status = 'OVERDUE')::int as overdueInvoices`;
    const score = 60 + Math.min(20, cu.touches) - (cu.overdueInvoices ?? 0) * 4;
    push("customers", "Customers", score,
      `${cu.total} customers · ${cu.touches} logged interactions · ${cu.overdueInvoices ?? 0} overdue invoices.`,
      "Engagement history raises the score; unpaid invoices lower it.", 0.7);
  } else {
    push("customers", "Customers", null, "No customers recorded yet.", "Neutral until customer data exists.", 0.2);
  }

  // Team: structure and coverage
  if (c.employees > 0) {
    const [e] = await sql`
      select count(*)::int as total,
        (select count(distinct department_id) from employees where organization_id = ${organizationId} and department_id is not null)::int as depts,
        (select count(*) from training_assignments ta join employees e2 on e2.id = ta.employee_id where e2.organization_id = ${organizationId})::int as assignments`;
    const score = 55 + Math.min(25, e.depts * 5) + Math.min(20, e.assignments * 3);
    push("team", "Team", score,
      `${e.total} employees across ${e.depts} departments · ${e.assignments} training assignments.`,
      "Departmental structure and active training lift the score.", 0.65);
  } else {
    push("team", "Team", null, "No employees recorded yet.", "Neutral until people data exists.", 0.2);
  }

  // Knowledge / data quality: captured docs + knowledge items
  {
    const score = Math.min(100, c.documents * 8 + c.knowledgeItems * 6);
    push("data", "Data & knowledge", score,
      `${c.documents} documents captured · ${c.knowledgeItems} knowledge items.`,
      "Captured, classified information makes every other score more trustworthy.", c.knowledgeItems > 5 ? 0.8 : 0.4);
  }

  const scored = dims.filter((d) => d.confidence >= 0.5);
  const dataQuality = dims.length ? scored.length / dims.length : 0;
  const overall = scored.length
    ? Math.round(scored.reduce((a, d) => a + d.score * d.confidence, 0) / scored.reduce((a, d) => a + d.confidence, 0))
    : 50;
  const grade = overall >= 75 ? "HEALTHY" : overall >= 55 ? "WATCH" : "AT_RISK";

  return {
    overall,
    grade,
    dataQuality: Math.round(dataQuality * 100) / 100,
    dimensions: dims.sort((a, b) => a.score - b.score),
    computedAt: new Date().toISOString(),
  };
}
