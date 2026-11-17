import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { guardWorkspaceModule } from "@/lib/guard";
import { baseAppUrl } from "@/lib/plan-links";
import FieldOpsClient, {
  type CalcDefaults,
  type ConversationRow,
  type GapRow,
  type IntelRow,
  type Kpis,
  type PlanRow,
  type ReviewRow,
  type RuleRow,
  type SalesRow,
  type UnconfirmedVisitRow,
  type WorkdayRow,
} from "./FieldOpsClient";

export const dynamic = "force-dynamic";

/** Workspace wall clock — the day boundary and displayed dates follow the
 *  org's timezone, not the server's UTC clock. Validate through Intl so a bad
 *  profile value can never break the SQL date arithmetic. */
function workspaceTimeZone(raw: unknown): string {
  const tz = typeof raw === "string" ? raw.trim() : "";
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
      return tz;
    } catch {
      // fall through
    }
  }
  return "America/Chicago";
}

const DEFAULT_RULES: RuleRow[] = [
  { key: "confirm_24h", label: "Prefer confirmations 24 hours ahead", hint: "Saved as a timing preference only. CUE does not send a reminder automatically.", enabled: true },
  { key: "arrival_window", label: "Prefer a 2-hour arrival window", hint: "Saved as a preference only. CUE does not currently apply it to bookings or messages.", enabled: true },
  { key: "deposit_new_customer", label: "Prefer deposits for first-time customers", hint: "Saved as a preference only. CUE does not collect or enforce a deposit yet.", enabled: false },
  { key: "no_show_fee", label: "Prefer no-show fee disclosure", hint: "Saved as a preference only. CUE does not currently add a fee to booking or confirmation copy.", enabled: false },
];

export default async function FieldOpsPage() {
  await guardWorkspaceModule();
  const session = await requireSession();
  const orgId = session.organizationId;
  const [tzRow] = (await sql`
    select timezone from business_profiles where organization_id = ${orgId}`) as unknown as [{ timezone: unknown } | undefined] ?? [];
  const orgTz = workspaceTimeZone(tzRow?.timezone);
  // One workspace-timezone clock for both the “today” board and the 7-day
  // unconfirmed window. PostgreSQL converts the org's local midnight back to
  // a timestamptz, so a UTC server cannot shift the shop's day.
  const [dayBounds] = (await sql`
    select
      (date_trunc('day', now() at time zone ${orgTz}) at time zone ${orgTz}) as day_start,
      ((date_trunc('day', now() at time zone ${orgTz}) + interval '1 day') at time zone ${orgTz}) as day_end,
      ((date_trunc('day', now() at time zone ${orgTz}) + interval '7 days') at time zone ${orgTz}) as week_end
  `) as unknown as [{ day_start: Date; day_end: Date; week_end: Date }];
  const dayStart = dayBounds.day_start;
  const dayEnd = dayBounds.day_end;
  const weekEnd = dayBounds.week_end;
  // Lazily materialize the explicit record for every scheduled visit the
  // board can act on. The migration backfills history; this covers visits
  // created after it ran without needing a database trigger.
  await sql`
    insert into appointment_confirmations (organization_id, appointment_id)
    select a.organization_id, a.id from appointments a
    where a.organization_id = ${orgId} and a.status = 'SCHEDULED'
      and a.scheduled_for >= ${dayStart} and a.scheduled_for < ${weekEnd}
    on conflict (appointment_id) do nothing`;
  const appUrl = await baseAppUrl();
  const fmtDay = (d: Date | string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: orgTz, month: "short", day: "numeric" }).format(new Date(d));

  // One query feeds both the seven-day tile and the Booking Rules list, so the
  // number and the rows cannot drift apart.
  const upcomingRows = (await sql`
    select a.id, a.title, a.scheduled_for,
           c.name as customer,
           ac.status as confirmation_status, ac.token as confirmation_token
    from appointments a
    join customers c on c.id = a.customer_id
    left join appointment_confirmations ac on ac.appointment_id = a.id
    where a.organization_id = ${orgId} and a.status = 'SCHEDULED'
      and a.scheduled_for >= ${dayStart} and a.scheduled_for < ${weekEnd}
      and not exists (
        select 1 from appointment_confirmations confirmed
        where confirmed.appointment_id = a.id and confirmed.confirmed_at is not null
      )
    order by a.scheduled_for asc`) as unknown as {
    id: string; title: string; scheduled_for: Date; customer: string;
    confirmation_status: string | null; confirmation_token: string | null;
  }[];
  const upcomingUnconfirmed: UnconfirmedVisitRow[] = upcomingRows.map((a) => ({
    id: String(a.id), customer: a.customer, title: a.title,
    when: new Date(a.scheduled_for).toISOString(),
    confirmationStatus: a.confirmation_status,
    confirmationLink: a.confirmation_token ? `${appUrl}/confirm/${a.confirmation_token}` : null,
  }));

  const [kpi] = (await sql`
    select
      coalesce((select sum(amount) from service_orders where organization_id = ${orgId} and opened_at >= now() - interval '30 days'), 0)::float as booked,
      (select count(*) from appointments where organization_id = ${orgId} and status = 'NO_SHOW' and scheduled_for >= now() - interval '30 days')::int as no_shows,
      (select count(*) from customers where organization_id = ${orgId} and (coalesce(phone,'') = '' or coalesce(email,'') = '' or coalesce(address,'') = ''))::int as data_gaps,
      (select count(*) from leads where organization_id = ${orgId} and status = 'WON' and created_at >= now() - interval '90 days')::int as won,
      (select count(*) from leads where organization_id = ${orgId} and status in ('WON','LOST') and created_at >= now() - interval '90 days')::int as closed,
      (select count(*) from service_orders where organization_id = ${orgId} and opened_at >= now() - interval '30 days')::int as opened,
      (select count(*) from service_orders where organization_id = ${orgId} and completed_at >= now() - interval '30 days')::int as completed,
      coalesce((select sum(amount) from invoices where organization_id = ${orgId} and status = 'OVERDUE'), 0)::float as overdue,
      (select count(*) from service_orders so
        where so.organization_id = ${orgId} and so.completed_at >= now() - interval '30 days' and so.invoiced_at is null
          and not exists (select 1 from invoices i where i.organization_id = ${orgId} and i.service_order_id = so.id and i.status <> 'VOID'))::int as unbilled_n,
      coalesce((select sum(so.amount) from service_orders so
        where so.organization_id = ${orgId} and so.completed_at >= now() - interval '30 days' and so.invoiced_at is null
          and not exists (select 1 from invoices i where i.organization_id = ${orgId} and i.service_order_id = so.id and i.status <> 'VOID')), 0)::float as unbilled_amount
  `) as unknown as {
    booked: number; no_shows: number; data_gaps: number;
    won: number; closed: number; opened: number; completed: number;
    overdue: number; unbilled_n: number; unbilled_amount: number;
  }[];

  const conversion = Number(kpi?.closed ?? 0) > 0
    ? Math.round((Number(kpi.won) / Number(kpi.closed)) * 100)
    : Number(kpi?.opened ?? 0) > 0
      ? Math.round((Number(kpi.completed) / Number(kpi.opened)) * 100)
      : null;

  const kpis: Kpis = {
    booked: Number(kpi?.booked ?? 0),
    conversion,
    conversionBasis: Number(kpi?.closed ?? 0) > 0 ? "won ÷ closed leads · 90d" : "completed ÷ opened jobs · 30d",
    unconfirmedVisits: upcomingUnconfirmed.length,
    dataGaps: Number(kpi?.data_gaps ?? 0),
    unbilledAmount: Number(kpi?.unbilled_amount ?? 0),
    overdueAmount: Number(kpi?.overdue ?? 0),
  };

  const salesRows = (await sql`
    select s.id, s.title, s.amount, s.completed_at, s.service_type, c.name as customer,
           coalesce(e.name, 'Unassigned') as seller
    from service_orders s
    join customers c on c.id = s.customer_id
    left join employees e on e.id = s.sold_by
    where s.organization_id = ${orgId}
      and s.completed_at >= now() - interval '45 days'
      and s.invoiced_at is null
      and not exists (
        select 1 from invoices i
        where i.organization_id = ${orgId} and i.service_order_id = s.id and i.status <> 'VOID'
      )
    order by s.completed_at desc limit 10`) as unknown as {
    id: string; title: string; amount: unknown; completed_at: Date | null;
    service_type: string | null; customer: string; seller: string;
  }[];
  const sales: SalesRow[] = salesRows.map((r) => ({
    id: String(r.id), customer: r.customer, title: r.title, amount: Number(r.amount ?? 0),
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    seller: r.seller, serviceType: r.service_type,
  }));

  const apptRows = (await sql`
    select a.id, a.title, a.scheduled_for, a.status,
           (ac.confirmed_at is not null) as confirmed,
           ac.status as confirmation_status, ac.sent_at as confirmation_sent_at,
           ac.token as confirmation_token,
           c.name as customer, c.phone
    from appointments a join customers c on c.id = a.customer_id
    left join appointment_confirmations ac on ac.appointment_id = a.id
    where a.organization_id = ${orgId}
      and a.scheduled_for >= ${dayStart}
      and a.scheduled_for < ${dayEnd}
    order by a.scheduled_for asc limit 12`) as unknown as {
    id: string; title: string; scheduled_for: Date; status: string; confirmed: boolean;
    confirmation_status: string | null; confirmation_sent_at: Date | null;
    confirmation_token: string | null; customer: string; phone: string | null;
  }[];
  const todayVisits: WorkdayRow[] = apptRows.map((a) => ({
    id: String(a.id), customer: a.customer, label: a.title, when: new Date(a.scheduled_for).toISOString(),
    status: a.status, confirmed: Boolean(a.confirmed), phone: a.phone, amount: 0,
    confirmationStatus: a.confirmation_status, confirmationLink: a.confirmation_token ? `${appUrl}/confirm/${a.confirmation_token}` : null,
  }));

  const openRows = (await sql`
    select s.id, s.title, s.status, s.amount, c.name as customer, c.phone
    from service_orders s join customers c on c.id = s.customer_id
    where s.organization_id = ${orgId} and s.status in ('OPEN','IN_PROGRESS','AWAITING_PARTS')
    order by case s.status when 'AWAITING_PARTS' then 0 when 'OPEN' then 1 else 2 end, s.opened_at asc
    limit 8`) as unknown as {
    id: string; title: string; status: string; amount: unknown; customer: string; phone: string | null;
  }[];
  const openJobs: WorkdayRow[] = openRows.map((j) => ({
    id: String(j.id), customer: j.customer, label: j.title, when: null,
    status: j.status, phone: j.phone, amount: Number(j.amount ?? 0),
  }));

  const ruleRows = (await sql`
    select rule_key, enabled from field_ops_rules where organization_id = ${orgId}`) as unknown as {
    rule_key: string; enabled: boolean;
  }[];
  const ruleMap = new Map(ruleRows.map((r) => [r.rule_key, r.enabled]));
  const rules: RuleRow[] = DEFAULT_RULES.map((r) => ({ ...r, enabled: ruleMap.get(r.key) ?? r.enabled }));

  const overdueRows = (await sql`
    select i.id, i.number, i.amount, i.due_at,
           greatest(0, (now() at time zone ${orgTz})::date
             - coalesce((i.due_at at time zone ${orgTz})::date, (now() at time zone ${orgTz})::date))::int as days,
           c.name as customer
    from invoices i join customers c on c.id = i.customer_id
    where i.organization_id = ${orgId} and i.status = 'OVERDUE'
    order by i.amount desc limit 6`) as unknown as {
    id: string; number: string; amount: unknown; due_at: Date | null; days: number; customer: string;
  }[];
  const staleRows = (await sql`
    select l.id, l.name, l.interest, l.est_value, l.created_at,
           greatest(0, (now() at time zone ${orgTz})::date
             - coalesce((l.last_contact_at at time zone ${orgTz})::date, (l.created_at at time zone ${orgTz})::date))::int as days
    from leads l
    where l.organization_id = ${orgId} and l.status in ('NEW','CONTACTED')
      and coalesce(l.last_contact_at, l.created_at) < now() - interval '2 days'
      and l.created_at < now() - interval '1 day'
    order by l.est_value desc nulls last, l.created_at asc limit 6`) as unknown as {
    id: string; name: string; interest: string | null; est_value: unknown; created_at: Date; days: number;
  }[];
  const conversations: ConversationRow[] = [
    ...overdueRows.map((r) => ({
      id: String(r.id), customer: r.customer, kind: "INVOICE" as const,
      reason: `Invoice ${r.number} · ${r.days}d past due`,
      amount: Number(r.amount ?? 0), href: "/pipeline/aging",
    })),
    ...staleRows.map((r) => ({
      id: String(r.id), customer: r.name, kind: "LEAD" as const,
      reason: `${r.interest ?? "Lead"} · quiet for ${r.days}d`,
      amount: r.est_value == null ? null : Number(r.est_value), href: "/pipeline",
    })),
  ].slice(0, 10);

  const planRows = (await sql`
    select ma.id, ma.plan_name, ma.annual_value, ma.ends_at, c.name as customer
    from maintenance_agreements ma join customers c on c.id = ma.customer_id
    where ma.organization_id = ${orgId} and ma.status = 'ACTIVE'
      and ma.ends_at is not null and ma.ends_at <= now() + interval '60 days'
    order by ma.ends_at asc limit 8`) as unknown as {
    id: string; plan_name: string; annual_value: unknown; ends_at: Date | null; customer: string;
  }[];
  const gapCustomers = (await sql`
    select c.id, c.name, count(s.id)::int as jobs, coalesce(sum(s.amount), 0)::float as spend
    from customers c join service_orders s on s.customer_id = c.id
    where c.organization_id = ${orgId} and s.completed_at >= now() - interval '365 days'
      and not exists (
        select 1 from maintenance_agreements ma
        where ma.organization_id = ${orgId} and ma.customer_id = c.id and ma.status = 'ACTIVE'
      )
    group by c.id, c.name having count(s.id) >= 2
    order by spend desc limit 6`) as unknown as {
    id: string; name: string; jobs: number; spend: number;
  }[];
  const plans: PlanRow[] = [
    ...planRows.map((p) => ({
      id: String(p.id), customer: p.customer, plan: p.plan_name, annual: Number(p.annual_value ?? 0),
      endsAt: p.ends_at ? new Date(p.ends_at).toISOString() : null,
      state: p.ends_at && new Date(p.ends_at).getTime() < Date.now() ? "EXPIRED" as const : "RENEW" as const,
    })),
    ...gapCustomers.map((c) => ({
      id: `gap-${c.id}`, customer: c.name, plan: "", annual: 0, endsAt: null,
      state: "GAP" as const, jobs: Number(c.jobs ?? 0),
    })),
  ];

  const [gapCounts] = (await sql`
    select
      count(*) filter (where coalesce(phone,'') = '')::int as no_phone,
      count(*) filter (where coalesce(email,'') = '')::int as no_email,
      count(*) filter (where coalesce(address,'') = '')::int as no_address
    from customers where organization_id = ${orgId}`) as unknown as {
    no_phone: number; no_email: number; no_address: number;
  }[];
  const gaps: GapRow[] = [
    { label: "Missing phone", count: Number(gapCounts?.no_phone ?? 0), href: "/pipeline/customers" },
    { label: "Missing email", count: Number(gapCounts?.no_email ?? 0), href: "/pipeline/customers" },
    { label: "Missing address", count: Number(gapCounts?.no_address ?? 0), href: "/pipeline/customers" },
  ];

  const reviewRows = (await sql`
    select s.id as order_id, c.name as customer, s.title, s.completed_at
    from service_orders s join customers c on c.id = s.customer_id
    where s.organization_id = ${orgId} and s.completed_at >= now() - interval '30 days'
      and not exists (
        select 1 from reviews rv
        where rv.organization_id = ${orgId} and rv.customer_id = c.id
          and rv.requested_at >= s.completed_at
          and rv.status in ('REQUESTED', 'RECEIVED')
      )
    order by s.completed_at desc limit 6`) as unknown as {
    order_id: string; customer: string; title: string; completed_at: Date | null;
  }[];
  const reviews: ReviewRow[] = reviewRows.map((r) => ({
    orderId: String(r.order_id), customer: r.customer, title: r.title,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  }));

  const noShowRows = (await sql`
    select a.title, a.scheduled_for, c.name as customer
    from appointments a join customers c on c.id = a.customer_id
    where a.organization_id = ${orgId} and a.status = 'NO_SHOW'
      and a.scheduled_for >= now() - interval '7 days'
    order by a.scheduled_for desc limit 2`) as unknown as {
    title: string; scheduled_for: Date; customer: string;
  }[];

  const intel: IntelRow[] = [];
  for (const n of noShowRows) {
    intel.push({
      event: "No-show", context: `${n.customer} · ${n.title}`,
      exception: `Missed ${fmtDay(n.scheduled_for)}`,
      action: "Call & rebook", href: "/pipeline", tone: "red",
    });
  }
  for (const s of sales.slice(0, 2)) {
    intel.push({
      event: "Job completed", context: `${s.customer} · ${s.title}`,
      exception: `Unbilled ${s.completedAt ? fmtDay(s.completedAt) : ""}`,
      action: "Create invoice", href: "/pipeline", tone: "amber",
    });
  }
  for (const o of overdueRows.slice(0, 2)) {
    intel.push({
      event: "Invoice overdue", context: `${o.customer} · ${o.number}`,
      exception: `${o.days} days late · $${Math.round(Number(o.amount ?? 0)).toLocaleString()}`,
      action: "Send reminder", href: "/pipeline/aging", tone: "red",
    });
  }
  for (const p of plans.filter((x) => x.state !== "GAP").slice(0, 2)) {
    intel.push({
      event: p.state === "EXPIRED" ? "Agreement expired" : "Agreement expiring",
      context: `${p.customer} · ${p.plan}`,
      exception: p.endsAt ? fmtDay(p.endsAt) : "No end date",
      action: "Renew plan", href: "/pipeline/unscheduled", tone: "cyan",
    });
  }

  const [paid365] = (await sql`
    select coalesce(sum(amount), 0)::float as total from invoices
    where organization_id = ${orgId} and status = 'PAID'
      and coalesce(paid_at, issued_at) >= now() - interval '365 days'`) as unknown as { total: number }[];
  const [booked365] = (await sql`
    select coalesce(sum(amount), 0)::float as total from service_orders
    where organization_id = ${orgId} and opened_at >= now() - interval '365 days'`) as unknown as { total: number }[];
  const [booked90] = (await sql`
    select coalesce(sum(amount), 0)::float as total from service_orders
    where organization_id = ${orgId} and opened_at >= now() - interval '90 days'`) as unknown as { total: number }[];
  const [avgTicket] = (await sql`
    select coalesce(avg(amount), 0)::float as avg from service_orders
    where organization_id = ${orgId} and completed_at >= now() - interval '180 days'`) as unknown as { avg: number }[];
  const [leads90] = (await sql`
    select count(*)::int as n from leads where organization_id = ${orgId} and created_at >= now() - interval '90 days'`) as unknown as { n: number }[];
  const annualRevenue = Number(paid365?.total ?? 0) > 0
    ? Number(paid365.total)
    : Number(booked365?.total ?? 0) > 0 ? Number(booked365.total) : 1_200_000;
  const unbilledPct = Number(booked90?.total ?? 0) > 0
    ? Math.min(25, Math.max(1, (Number(kpis.unbilledAmount) / Number(booked90.total)) * 100))
    : 3;
  const noShowBase = Number(kpi?.no_shows ?? 0) + Number(kpi?.completed ?? 0);
  const calc: CalcDefaults = {
    annualRevenue: Math.round(annualRevenue),
    avgTicket: Math.round(Number(avgTicket?.avg ?? 0)) || 450,
    monthlyLeads: Math.max(1, Math.round(Number(leads90?.n ?? 0) / 3)) || 40,
    closeRate: conversion ?? 45,
    noShowRate: noShowBase > 0 ? Math.round((Number(kpi.no_shows) / noShowBase) * 100) : 8,
    unbilledPct: Math.round(unbilledPct * 10) / 10,
    overdueAmount: Number(kpis.overdueAmount),
    expiringValue: plans.filter((p) => p.state !== "GAP").reduce((n, p) => n + p.annual, 0),
  };
  const sources = (await sql`
    select key, name, status, last_sync_at, account_name, (api_key_enc is not null) as connected
    from integrations
    where organization_id = ${orgId} and key in ('housecall_pro', 'servicetitan', 'jobber', 'webhook')
    order by case key when 'housecall_pro' then 0 when 'servicetitan' then 1 when 'jobber' then 2 else 3 end`) as unknown as {
    key: string; name: string; status: string; last_sync_at: Date | null; account_name: string | null; connected: boolean;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Field Ops</h1>
          <p className="page-sub">
            The layer above your field-service platform. Housecall Pro syncs today; ServiceTitan and Jobber are connector slots,
            and CSV or a generic webhook works with no FSM at all. CUE reads the work, finds what is slipping, and prepares the fix
            without replacing dispatch.
          </p>
        </div>
        <a href="/ecosystem" className="btn-primary shrink-0 !px-4 !py-2 text-xs">Connect Housecall Pro →</a>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {sources.map((s) => (
          <a key={s.key} href="/ecosystem" className="badge-blue hover:brightness-110">
            {s.name}: {s.connected ? "connected" : s.status.toLowerCase()}
          </a>
        ))}
        <span className="badge-low">CSV / generic webhook</span>
        <span className="muted">Provider-agnostic records — switch tools without losing the intelligence.</span>
      </div>

      <FieldOpsClient
        kpis={kpis}
        sales={sales}
        todayVisits={todayVisits}
        unconfirmedUpcoming={upcomingUnconfirmed}
        openJobs={openJobs}
        rules={rules}
        conversations={conversations}
        plans={plans}
        gaps={gaps}
        reviews={reviews}
        intel={intel.slice(0, 8)}
        calc={calc}
        readOnly={session.role === "MEMBER"}
        timeZone={orgTz}
      />
    </div>
  );
}