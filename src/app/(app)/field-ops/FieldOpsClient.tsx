"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAppointment,
  createFieldOpsTask,
  draftFieldOpsInvoice,
  renewFieldOpsPlan,
  requestFieldOpsReview,
  sendVisitConfirmation,
  setFieldOpsRule,
} from "./actions";

export type Kpis = {
  booked: number;
  conversion: number | null;
  conversionBasis: string;
  unconfirmedVisits: number;
  dataGaps: number;
  unbilledAmount: number;
  overdueAmount: number;
};

export type SalesRow = {
  id: string;
  customer: string;
  title: string;
  amount: number;
  completedAt: string | null;
  seller: string;
  serviceType: string | null;
};

export type WorkdayRow = {
  id: string;
  customer: string;
  label: string;
  when: string | null;
  status: string;
  confirmed?: boolean;
  confirmationStatus?: string | null;
  confirmationLink?: string | null;
  phone: string | null;
  amount: number;
};

export type UnconfirmedVisitRow = {
  id: string;
  customer: string;
  title: string;
  when: string;
  confirmationStatus: string | null;
  confirmationLink: string | null;
};

export type RuleRow = {
  key: string;
  label: string;
  hint: string;
  enabled: boolean;
};

export type ConversationRow = {
  id: string;
  kind: "INVOICE" | "LEAD";
  customer: string;
  reason: string;
  amount: number | null;
  href: string;
};

export type PlanRow = {
  id: string;
  customer: string;
  plan: string;
  annual: number;
  endsAt: string | null;
  state: "RENEW" | "EXPIRED" | "GAP";
  jobs?: number;
};

export type GapRow = { label: string; count: number; href: string };
export type ReviewRow = {
  orderId: string;
  customer: string;
  title: string;
  completedAt: string | null;
};

export type IntelRow = {
  event: string;
  context: string;
  exception: string;
  action: string;
  href: string;
  tone: "red" | "amber" | "cyan";
};

export type CalcDefaults = {
  annualRevenue: number;
  avgTicket: number;
  monthlyLeads: number;
  closeRate: number;
  noShowRate: number;
  unbilledPct: number;
  overdueAmount: number;
  expiringValue: number;
};

const money = (n: number | null | undefined) =>
  "$" + Math.round(Number(n ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 });

const age = (d: string | null) => {
  if (!d) return "—";
  const days = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5));
  return days === 0 ? "today" : `${days}d`;
};

const TABS = [
  ["sales", "Technician Sales"],
  ["workday", "Technician Workday"],
  ["booking", "Booking Rules"],
  ["conversations", "Customer Conversations"],
  ["plans", "Service Plan Context"],
  ["data", "Reviews & Data Gaps"],
] as const;

type TabKey = (typeof TABS)[number][0];

export default function FieldOpsClient({
  kpis,
  sales,
  todayVisits,
  unconfirmedUpcoming,
  openJobs,
  rules,
  conversations,
  plans,
  gaps,
  reviews,
  intel,
  calc,
  readOnly,
  timeZone,
}: {
  kpis: Kpis;
  sales: SalesRow[];
  todayVisits: WorkdayRow[];
  unconfirmedUpcoming: UnconfirmedVisitRow[];
  openJobs: WorkdayRow[];
  rules: RuleRow[];
  conversations: ConversationRow[];
  plans: PlanRow[];
  gaps: GapRow[];
  reviews: ReviewRow[];
  intel: IntelRow[];
  calc: CalcDefaults;
  readOnly: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("sales");
  const [ruleState, setRuleState] = useState(rules);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [visits, setVisits] = useState(todayVisits);
  const [upcomingUnconfirmed, setUpcomingUnconfirmed] = useState(unconfirmedUpcoming);
  const [unconfirmedVisits, setUnconfirmedVisits] = useState(kpis.unconfirmedVisits);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ key: string; text: string; error?: boolean } | null>(null);
  const [draftedOrders, setDraftedOrders] = useState<Record<string, string>>({});
  const [taskedRows, setTaskedRows] = useState<Record<string, boolean>>({});
  const [requestedReviews, setRequestedReviews] = useState<Record<string, boolean>>({});
  const [renewedPlans, setRenewedPlans] = useState<Record<string, boolean>>({});

  async function runAction<T extends { ok: boolean; error?: string }>(
    key: string,
    work: () => Promise<T>,
    onSuccess: (res: T) => void,
    successText: (res: T) => string,
  ) {
    setBusyAction(key);
    setActionMessage(null);
    try {
      const res = await work();
      if (!res.ok) {
        setActionMessage({ key, text: res.error ?? "Could not complete that action.", error: true });
        return;
      }
      onSuccess(res);
      setActionMessage({ key, text: successText(res) });
      router.refresh();
    } catch (e) {
      setActionMessage({
        key,
        text: e instanceof Error ? e.message : "Could not complete that action.",
        error: true,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleRule(key: string, enabled: boolean) {
    setRuleError(null);
    setRuleState((prev) => prev.map((r) => (r.key === key ? { ...r, enabled } : r)));
    const res = await setFieldOpsRule(key, enabled);
    if (!res.ok) {
      setRuleState((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: !enabled } : r)));
      setRuleError(res.error ?? "Could not save that rule.");
    }
  }

  function confirmVisit(id: string) {
    const wasUnconfirmed = visits.some((v) => v.id === id && !v.confirmed);
    const wasUpcoming = upcomingUnconfirmed.some((v) => v.id === id);
    void runAction(`mark:${id}`, () => confirmAppointment(id), () => {
      setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, confirmed: true, confirmationStatus: "CONFIRMED" } : v)));
      setUpcomingUnconfirmed((prev) => prev.filter((v) => v.id !== id));
      if (wasUnconfirmed || wasUpcoming) setUnconfirmedVisits((n) => Math.max(0, n - 1));
    }, () => "Visit marked confirmed.");
  }

  function sendConfirmation(id: string) {
    const wasUnconfirmed = visits.some((v) => v.id === id && !v.confirmed);
    void runAction(`send:${id}`, () => sendVisitConfirmation(id), (res) => {
      if (res.already) {
        setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, confirmed: true, confirmationStatus: "CONFIRMED" } : v)));
        if (wasUnconfirmed) setUnconfirmedVisits((n) => Math.max(0, n - 1));
      } else {
        setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, confirmationStatus: "SENT" } : v)));
      }
      return res;
    }, (res) => res.already
      ? "This visit was already confirmed."
      : `Confirmation sent via ${res.channel === "EMAIL" ? "email" : "WhatsApp"} — waiting for the customer to confirm.`);
  }

  function draftInvoice(orderId: string) {
    void runAction(`invoice:${orderId}`, () => draftFieldOpsInvoice(orderId), (res) => {
      setDraftedOrders((prev) => ({ ...prev, [orderId]: res.number ?? "Draft" }));
    }, (res) => res.number
      ? `Draft ${res.number} is ready — review and release it in Pipeline.`
      : "Draft invoice is ready — review and release it in Pipeline.");
  }

  function createTask(row: ConversationRow) {
    const key = `${row.kind}:${row.id}`;
    void runAction(`task:${key}`, () => createFieldOpsTask(row.kind, row.id), (res) => {
      setTaskedRows((prev) => ({ ...prev, [key]: true }));
      return res;
    }, (res) => res.already ? "A follow-up task is already open." : "Task created for tomorrow.");
  }

  function requestReview(row: ReviewRow) {
    void runAction(`review:${row.orderId}`, () => requestFieldOpsReview(row.orderId), (res) => {
      setRequestedReviews((prev) => ({ ...prev, [row.orderId]: true }));
      return res;
    }, (res) => res.already
      ? "A review request is already on record."
      : `Review request logged${res.channel ? ` via ${res.channel.toLowerCase()}` : ""}.`);
  }

  function renewPlan(row: PlanRow) {
    void runAction(`plan:${row.id}`, () => renewFieldOpsPlan(row.id), (res) => {
      setRenewedPlans((prev) => ({ ...prev, [row.id]: true }));
      return res;
    }, (res) => {
      const through = res.endsAt
        ? new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(res.endsAt))
        : "";
      return `${res.planName ?? "Plan"} ${res.created ? "created" : "renewed"}${through ? ` through ${through}` : ""}.`;
    });
  }

  const unbilledTotal = sales.reduce((n, r) => n + Number(r.amount ?? 0), 0);
  const techRollup = Object.values(
    sales.reduce<Record<string, { name: string; jobs: number; value: number }>>((acc, r) => {
      const key = r.seller || "Unassigned";
      acc[key] ??= { name: key, jobs: 0, value: 0 };
      acc[key].jobs += 1;
      acc[key].value += Number(r.amount ?? 0);
      return acc;
    }, {}),
  ).sort((a, b) => b.value - a.value);
  const activeReviews = reviews.filter((r) => !requestedReviews[r.orderId]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Booked · 30 days", value: money(kpis.booked), note: "jobs opened across every source" },
          { label: "Conversion", value: kpis.conversion == null ? "—" : `${kpis.conversion}%`, note: kpis.conversionBasis },
          { label: "Unconfirmed visits", value: String(unconfirmedVisits), note: "next 7 days · no explicit confirmation record" },
          { label: "Data gaps", value: String(kpis.dataGaps), note: "customers missing phone, email or address" },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-navy-300">{k.label}</div>
            <div className="kpi mt-1.5 !text-3xl">{k.value}</div>
            <div className="muted mt-1 text-[11px]">{k.note}</div>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-white/[0.06] p-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                tab === key
                  ? "bg-cyan-500/20 font-semibold text-cyan-100 ring-1 ring-cyan-400/40"
                  : "text-navy-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] text-navy-300">
          Every action is role-gated and written to the audit trail. Invoices stay drafts until you release them; messages send only when you click.
        </div>
        {actionMessage && (
          <div className={`border-b border-white/[0.06] px-4 py-2 text-xs ${actionMessage.error ? "bg-red-500/10 text-red-200" : "bg-emerald-500/10 text-emerald-200"}`}>
            {actionMessage.text}
          </div>
        )}

        <div className="p-4">
          {tab === "sales" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Completed work with no invoice</h2>
                <span className="badge-orange">{sales.length} jobs · {money(unbilledTotal)}</span>
                <a href="/pipeline" className="ms-auto text-xs text-cyan-300 hover:underline">Open Pipeline →</a>
              </div>
              <p className="muted text-xs">
                The technician-sales view: work already finished, attributed to the person who sold it, with the money still uncollected.
              </p>
              {sales.length === 0 ? (
                <p className="muted text-sm">No completed jobs are waiting on an invoice.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-navy-300/70">
                      <tr><th className="pb-2">Customer</th><th className="pb-2">Job</th><th className="pb-2">Sold by</th><th className="pb-2">Type</th><th className="pb-2">Age</th><th className="pb-2 text-right">Value</th><th className="pb-2 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {sales.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 font-medium text-white">{r.customer}</td>
                          <td className="py-2 text-navy-100">{r.title}</td>
                          <td className="py-2 text-navy-300">{r.seller}</td>
                          <td className="py-2 text-navy-300">{r.serviceType ?? "—"}</td>
                          <td className="py-2 text-navy-300">{age(r.completedAt)}</td>
                          <td className="py-2 text-right font-semibold text-amber-300">{money(r.amount)}</td>
                          <td className="py-2 ps-3 text-right">
                            {draftedOrders[r.id] ? (
                              <span className="badge-green" title={draftedOrders[r.id]}>DRAFT READY</span>
                            ) : readOnly ? (
                              <span className="muted">—</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => draftInvoice(r.id)}
                                className="btn-ghost !px-2.5 !py-1 text-[11px]"
                              >
                                {busyAction === `invoice:${r.id}` ? "Preparing…" : "Draft invoice"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {techRollup.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {techRollup.map((t) => (
                    <span key={t.name} className="badge-low">{t.name}: {t.jobs} jobs · {money(t.value)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "workday" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-white">Today&rsquo;s visits <span className="muted text-[11px] font-normal">{timeZone}</span></h2>
                {visits.length === 0 ? <p className="muted text-sm">No visits scheduled today.</p> : (
                  <ul className="space-y-2">
                    {visits.map((a) => (
                      <li key={a.id} className="rounded-lg bg-white/[0.03] p-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">{a.customer}</span>
                          <span className={`badge ${a.status === "NO_SHOW" ? "badge-red" : "badge-low"}`}>{a.status.replaceAll("_", " ")}</span>
                          {a.status === "SCHEDULED" && (
                            a.confirmed ? (
                              <span className="badge-green ms-auto">CONFIRMED</span>
                            ) : (
                              <div className="ms-auto flex flex-wrap items-center justify-end gap-1">
                                {a.confirmationStatus === "SENT" && (
                                  <span className="badge-blue">SENT · AWAITING</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => sendConfirmation(a.id)}
                                  disabled={readOnly || busyAction !== null}
                                  className="btn-primary !px-2.5 !py-1 text-[11px]"
                                >
                                  {busyAction === `send:${a.id}` ? "Sending…" : a.confirmationStatus === "SENT" ? "Resend link" : "Send confirmation"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirmVisit(a.id)}
                                  disabled={readOnly || busyAction !== null}
                                  className="btn-ghost !px-2.5 !py-1 text-[11px]"
                                >
                                  {busyAction === `mark:${a.id}` ? "Saving…" : "Mark confirmed"}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        <div className="muted mt-0.5">{a.label}{a.when ? ` · ${new Date(a.when).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone })}` : ""}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-cyan-300">
                          {a.phone && <span>{a.phone}</span>}
                          {a.confirmationLink && (
                            <a href={a.confirmationLink} target="_blank" rel="noreferrer" className="hover:underline">
                              Customer confirmation link ↗
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold text-white">Open work not on today&rsquo;s board</h2>
                {openJobs.length === 0 ? <p className="muted text-sm">No open jobs.</p> : (
                  <ul className="space-y-2">
                    {openJobs.map((j) => (
                      <li key={j.id} className="rounded-lg bg-white/[0.03] p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{j.customer}</span>
                          <span className="badge-low ms-auto">{j.status.replaceAll("_", " ")}</span>
                        </div>
                        <div className="muted mt-0.5">{j.label} · {money(j.amount)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <a href="/pipeline/unscheduled" className="mt-2 inline-block text-xs text-cyan-300 hover:underline">Open unscheduled board →</a>
              </div>
            </div>
          )}

          {tab === "booking" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Booking preferences</h2>
                <span className="badge-blue">{unconfirmedVisits} upcoming visits to confirm</span>
              </div>
              <p className="muted text-xs">
                These toggles save the office&apos;s preferences for this workspace only. They do not change booking or appointment behavior, and CUE does not send reminders automatically.
              </p>
              <ul className="space-y-2">
                {ruleState.map((r) => (
                  <li key={r.key} className="flex items-start gap-3 rounded-lg bg-white/[0.03] p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{r.label}</div>
                      <div className="muted mt-0.5 text-xs">{r.hint}</div>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleRule(r.key, !r.enabled)}
                      aria-pressed={r.enabled}
                      className={`badge shrink-0 ${r.enabled ? "badge-green" : "badge-low"} ${readOnly ? "opacity-60" : ""}`}
                    >
                      {r.enabled ? "ON" : "OFF"}
                    </button>
                  </li>
                ))}
              </ul>
              {ruleError && <p className="text-xs text-red-300">{ruleError}</p>}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">Unconfirmed visits · next 7 days</h3>
                  <span className={`badge ${upcomingUnconfirmed.length ? "badge-blue" : "badge-green"}`}>
                    {upcomingUnconfirmed.length ? `${upcomingUnconfirmed.length} to confirm` : "All clear"}
                  </span>
                </div>
                {upcomingUnconfirmed.length === 0 ? (
                  <p className="muted mt-2 text-xs">Every scheduled visit in the next seven days has an explicit confirmation on record.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-white/[0.05]">
                    {upcomingUnconfirmed.map((v) => (
                      <li key={v.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-white">{v.customer}</div>
                          <div className="muted text-xs">
                            {v.title} · {new Intl.DateTimeFormat("en-US", {
                              timeZone, weekday: "short", month: "short", day: "numeric",
                              hour: "numeric", minute: "2-digit",
                            }).format(new Date(v.when))}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`badge ${v.confirmationStatus === "SENT" ? "badge-blue" : "badge-low"}`}>
                              {v.confirmationStatus === "SENT" ? "LINK SENT" : "NOT SENT"}
                            </span>
                            {v.confirmationLink && (
                              <a href={v.confirmationLink} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-300 hover:underline">
                                Customer link ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => confirmVisit(v.id)}
                          disabled={readOnly || busyAction !== null}
                          className="btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
                        >
                          {busyAction === `mark:${v.id}` ? "Confirming…" : "Mark confirmed"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3 text-xs text-navy-300">
                These are saved preferences only — no reminder is sent automatically. The tile and this list use the same seven-day query. Sending a link marks it sent but does not clear the visit — the customer link or Mark confirmed does.
              </div>
            </div>
          )}

          {tab === "conversations" && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-white">Conversations that need a human</h2>
              <p className="muted text-xs">Overdue money and leads that have gone quiet — ordered by dollars first.</p>
              {conversations.length === 0 ? <p className="muted text-sm">Nothing waiting. Conversations are clear.</p> : (
                <ul className="divide-y divide-white/[0.05]">
                  {conversations.map((c) => (
                    <li key={`${c.kind}-${c.id}`} className="flex items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white">{c.customer}</div>
                        <div className="muted text-xs">{c.reason}</div>
                      </div>
                      {c.amount != null && <span className="text-xs font-semibold text-amber-300">{money(c.amount)}</span>}
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {taskedRows[`${c.kind}:${c.id}`] ? (
                          <span className="text-[11px] font-semibold text-emerald-300">TASK OPEN</span>
                        ) : readOnly ? null : (
                          <button
                            type="button"
                            onClick={() => createTask(c)}
                            disabled={busyAction !== null}
                            className="btn-ghost !px-2.5 !py-1 text-[11px]"
                          >
                            {busyAction === `task:${c.kind}:${c.id}` ? "Creating…" : "Create task"}
                          </button>
                        )}
                        <a href={c.href} className="text-xs text-cyan-300 hover:underline">Open →</a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "plans" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Service-plan context</h2>
                <span className="badge-orange">{money(plans.filter((p) => p.state !== "GAP").reduce((n, p) => n + p.annual, 0))} annual value at risk</span>
              </div>
              <p className="muted text-xs">Renewals inside 60 days, already-expired agreements, and heavy users with no plan — the context a tech needs before the visit.</p>
              {plans.length === 0 ? <p className="muted text-sm">No agreements nearing renewal and no obvious plan gaps.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-navy-300/70">
                      <tr><th className="pb-2">Customer</th><th className="pb-2">Plan</th><th className="pb-2">Status</th><th className="pb-2">Ends</th><th className="pb-2 text-right">Annual</th><th className="pb-2 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {plans.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 font-medium text-white">{p.customer}</td>
                          <td className="py-2 text-navy-100">{p.state === "GAP" ? `${p.jobs ?? 0} completed jobs, no plan` : p.plan}</td>
                          <td className="py-2"><span className={`badge ${p.state === "EXPIRED" ? "badge-red" : p.state === "RENEW" ? "badge-orange" : "badge-blue"}`}>{p.state}</span></td>
                          <td className="py-2 text-navy-300">{p.endsAt ? new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(p.endsAt)) : "—"}</td>
                          <td className="py-2 text-right text-navy-100">{p.annual ? money(p.annual) : "—"}</td>
                          <td className="py-2 text-right">
                            {renewedPlans[p.id] ? (
                              <span className="text-[11px] font-semibold text-emerald-300">UPDATED</span>
                            ) : readOnly ? (
                              <span className="muted">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => renewPlan(p)}
                                disabled={busyAction !== null}
                                className="btn-ghost !px-2.5 !py-1 text-[11px]"
                              >
                                {busyAction === `plan:${p.id}` ? "Saving…" : p.state === "GAP" ? "Create plan" : "Renew plan"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-white">Customer data gaps</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  {gaps.map((g) => (
                    <a key={g.label} href={g.href} className="rounded-lg bg-white/[0.03] p-3 hover:bg-white/[0.06]">
                      <div className="kpi !text-2xl">{g.count}</div>
                      <div className="muted mt-1 text-xs">{g.label}</div>
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">Review follow-ups</h2>
                  <span className="badge-blue">{activeReviews.length} recent completed jobs</span>
                </div>
                  <p className="muted mt-1 text-xs">Completed work with no review request on record — candidates, not an automatic send.</p>
                {activeReviews.length === 0 ? <p className="muted mt-2 text-sm">Every recent job has a review touch.</p> : (
                  <ul className="mt-2 divide-y divide-white/[0.05]">
                    {activeReviews.map((r) => (
                      <li key={r.orderId} className="flex items-center gap-3 py-2 text-xs">
                        <span className="font-medium text-white">{r.customer}</span>
                        <span className="muted min-w-0 flex-1 truncate">{r.title}</span>
                        <span className="text-navy-300">{age(r.completedAt)}</span>
                        <button
                          type="button"
                          onClick={() => requestReview(r)}
                          disabled={readOnly || busyAction !== null}
                          className="btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
                        >
                          {busyAction === `review:${r.orderId}` ? "Logging…" : "Request review"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-white">Daily intelligence</h2>
          <span className="muted text-xs">Event → context → exception → action, computed from live records</span>
        </div>
        {intel.length === 0 ? <p className="muted text-sm">No exceptions today.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-navy-300/70">
                <tr><th className="pb-2">Event</th><th className="pb-2">Context</th><th className="pb-2">Exception</th><th className="pb-2">Action</th><th className="pb-2" /></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {intel.map((r, i) => (
                  <tr key={`${r.event}-${i}`}>
                    <td className="py-2"><span className={`badge ${r.tone === "red" ? "badge-red" : r.tone === "amber" ? "badge-orange" : "badge-blue"}`}>{r.event}</span></td>
                    <td className="py-2 text-navy-100">{r.context}</td>
                    <td className="py-2 text-navy-300">{r.exception}</td>
                    <td className="py-2 text-navy-100">{r.action}</td>
                    <td className="py-2 text-right"><a href={r.href} className="text-cyan-300 hover:underline">Go →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OpportunityCalculator defaults={calc} />
    </div>
  );
}

function OpportunityCalculator({ defaults }: { defaults: CalcDefaults }) {
  const [annualRevenue, setAnnualRevenue] = useState(defaults.annualRevenue);
  const [avgTicket, setAvgTicket] = useState(defaults.avgTicket);
  const [monthlyLeads, setMonthlyLeads] = useState(defaults.monthlyLeads);
  const [closeRate, setCloseRate] = useState(defaults.closeRate);
  const [noShowRate, setNoShowRate] = useState(defaults.noShowRate);
  const [unbilledPct, setUnbilledPct] = useState(defaults.unbilledPct);

  const monthly = Math.max(0, annualRevenue) / 12;
  const unbilled = monthly * (Math.max(0, unbilledPct) / 100) * 0.6;
  const overdue = Math.max(0, defaults.overdueAmount) * 0.35 / 3;
  const lostLeads = Math.max(0, monthlyLeads) * (1 - Math.min(100, Math.max(0, closeRate)) / 100) * Math.max(0, avgTicket) * 0.15;
  const noShows = Math.max(0, monthlyLeads) * (Math.min(100, Math.max(0, closeRate)) / 100) * (Math.min(100, Math.max(0, noShowRate)) / 100) * Math.max(0, avgTicket) * 0.25;
  const renewals = Math.max(0, defaults.expiringValue) * 0.5 / 12;
  const total = unbilled + overdue + lostLeads + noShows + renewals;

  const fields: { label: string; value: number; set: (n: number) => void; prefix?: string; suffix?: string; step?: number }[] = [
    { label: "Annual revenue", value: annualRevenue, set: setAnnualRevenue, prefix: "$", step: 10000 },
    { label: "Average ticket", value: avgTicket, set: setAvgTicket, prefix: "$", step: 25 },
    { label: "Leads / month", value: monthlyLeads, set: setMonthlyLeads, step: 5 },
    { label: "Close rate", value: closeRate, set: setCloseRate, suffix: "%", step: 1 },
    { label: "No-show rate", value: noShowRate, set: setNoShowRate, suffix: "%", step: 1 },
    { label: "Unbilled work", value: unbilledPct, set: setUnbilledPct, suffix: "%", step: 0.5 },
  ];

  return (
    <section className="card border-l-2 border-l-emerald-400/70 p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-white">Revenue opportunity scan</h2>
        <span className="muted text-xs">Prefilled from this workspace — change any input to model it</span>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.label} className="text-xs text-navy-300">
              {f.label}
              <div className="mt-1 flex items-center rounded-lg border border-white/10 bg-ink-950/60 px-2">
                {f.prefix && <span className="text-navy-300">{f.prefix}</span>}
                <input
                  type="number"
                  min={0}
                  step={f.step ?? 1}
                  value={f.value}
                  onChange={(e) => f.set(Number(e.target.value))}
                  className="w-full bg-transparent px-1 py-1.5 text-sm text-white outline-none"
                />
                {f.suffix && <span className="text-navy-300">{f.suffix}</span>}
              </div>
            </label>
          ))}
        </div>
        <div className="rounded-xl bg-emerald-500/[0.06] p-4 ring-1 ring-emerald-400/20">
          <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">Monthly opportunity</div>
          <div className="kpi mt-1 !text-4xl text-emerald-200">{money(total)}</div>
          <div className="muted mt-1 text-xs">{money(total * 12)} annualized · estimate, not a guarantee</div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {[
              ["Unbilled work recovered", unbilled],
              ["Overdue invoices collected", overdue],
              ["Quiet leads won back", lostLeads],
              ["No-shows recovered", noShows],
              ["Agreements renewed", renewals],
            ].map(([label, value]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-navy-100">{label}</span>
                <span className="font-semibold text-white">{money(Number(value))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}