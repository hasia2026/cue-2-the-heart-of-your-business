import { sql } from "./db";
import { getWorkspaceProfile, validAccent } from "./workspace-profile";
import { buildSuggestedOrder } from "./suggested-order";

type DigestSection = { heading: string; lines: string[] };

export type DigestData = {
  orgName: string;
  openLeaks: DigestSection;
  pendingDecisions: DigestSection;
  /** Revi's follow-up chase list — same build the import-page card reads
   *  (dismissed rows already excluded), in the money-first priority order. */
  suggestedOrder: DigestSection;
  actionItems: DigestSection;
  approvedThisWeek: DigestSection;
  unbilled: DigestSection;
  moneyFound: DigestSection;
  planSignups: DigestSection;
};

/** All digest figures come from the same live tables the dashboard reads. */
export async function buildDigestData(orgId: string): Promise<DigestData> {
  const [[org], profile] = await Promise.all([
    sql`select name from organizations where id = ${orgId}`,
    getWorkspaceProfile(orgId),
  ]);
  if (!org) throw new Error("Organization not found");
  const ambassadorName = profile.ambassadorName ?? "Revi";

  const openInsights = await sql`
    select title, severity, impact_value
    from insights
    where organization_id = ${orgId} and status = 'OPEN'
    order by case severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end,
             impact_value desc nulls last
    limit 5`;
  const [openTotal] = await sql`
    select count(*)::int as n, coalesce(sum(impact_value),0)::float as value
    from insights where organization_id = ${orgId} and status = 'OPEN'`;

  const pending = await sql`
    select title, impact_value
    from recommendations
    where organization_id = ${orgId} and status = 'PENDING'
    order by impact_value desc nulls last
    limit 5`;

  const approvedWeek = await sql`
    select title, decided_at
    from recommendations
    where organization_id = ${orgId}
      and status = 'APPROVED' and decided_at > now() - interval '7 days'
    order by decided_at desc`;

  // Meeting-agenda layer: who owns what this week. Open tasks with their
  // human owner (role-based default assignment already lands in
  // tasks.assignee_id via workflows.ts; unassigned tasks surface as “owner: none”
  // so the agenda shows the true accountability gap).
  const openItems = await sql`
    select t.title, t.priority, t.status, e.name as owner
    from tasks t
    left join employees e on e.id = t.assignee_id
    where t.organization_id = ${orgId} and t.status in ('OPEN','IN_PROGRESS')
    order by case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, t.created_at asc
    limit 6`;

  // Same recovered-money proxies the end-of-pilot report uses (report/page.tsx).
  const [dollars] = await sql`
    select
      (select coalesce(sum(amount),0) from service_orders
        where organization_id = ${orgId} and status='COMPLETED' and invoiced_at is not null
        and invoiced_at > opened_at + interval '30 days')::float as invoiced_late,
      (select coalesce(sum(amount),0) from invoices
        where organization_id = ${orgId} and status='PAID' and paid_at > due_at)::float as collected_late,
      (select coalesce(sum(est_value),0) from leads
        where organization_id = ${orgId} and status='WON')::float as won_pipeline`;
  const recovered =
    Number(dollars?.invoiced_late ?? 0) +
    Number(dollars?.collected_late ?? 0) +
    Number(dollars?.won_pipeline ?? 0);

  const money = (n: number) => "$" + Math.round(n).toLocaleString();
  const openLeaks: DigestSection = {
    heading: `Open revenue leaks (${openTotal?.n ?? 0}) — ${money(Number(openTotal?.value ?? 0))} at stake`,
    lines: openInsights.map(
      (i) => `• [${i.severity}] ${i.title} — ${i.impact_value ? money(Number(i.impact_value)) : "value TBD"}`,
    ),
  };
  if (!openLeaks.lines.length) openLeaks.lines.push("• No open leaks — clean week.");

  const pendingDecisions: DigestSection = {
    heading: `Decisions awaiting your approval (${pending.length})`,
    lines: pending.map((r) => `• ${r.title}${r.impact_value ? ` — ${money(Number(r.impact_value))}` : ""}`),
  };
  if (!pendingDecisions.lines.length) pendingDecisions.lines.push("• Nothing waiting — inbox zero.");

  const approvedThisWeek: DigestSection = {
    heading: `Approvals this week (${approvedWeek.length})`,
    lines: approvedWeek.map((r) => `• ${r.title} (${new Date(r.decided_at).toLocaleDateString()})`),
  };
  if (!approvedThisWeek.lines.length) approvedThisWeek.lines.push("• No new approvals in the last 7 days.");

  const actionItems: DigestSection = {
    heading: `Action items with owners (${openItems.length} open)`,
    lines: openItems.map(
      (t) =>
        `• [${t.priority}] ${t.title} — owner: ${t.owner ?? "UNASSIGNED"}${t.status === "IN_PROGRESS" ? " (in progress)" : ""}`,
    ),
  };
  if (!actionItems.lines.length) actionItems.lines.push("• No open tasks — run the approved workflows from Execute.");

  // Unbilled-revenue alert: completed service orders with no live
  // (non-VOID) invoice. These are jobs the crew finished that the owner
  // may not realize were never billed — same definition the Pipeline
  // "UNBILLED" badge uses, so the digest and the board never disagree.
  const [unbilledRow] = await sql`
    select count(*)::int as n, coalesce(sum(amount), 0)::float as total
    from service_orders so
    where organization_id = ${orgId} and status = 'COMPLETED' and invoiced_at is null
      and not exists (
        select 1 from invoices i
        where i.service_order_id = so.id and i.status <> 'VOID')`;
  const unbilledN = Number(unbilledRow?.n ?? 0);
  const unbilledTotal = Number(unbilledRow?.total ?? 0);
  const unbilled: DigestSection = {
    heading: unbilledN
      ? `⚠ Unbilled completed work (${unbilledN} jobs) — ${money(unbilledTotal)} never invoiced`
      : "Unbilled completed work (0 jobs)",
    lines: unbilledN
      ? [`• ${unbilledN} completed job(s) totaling ${money(unbilledTotal)} still have no invoice — draft and release them in Pipeline → Work orders.`]
      : ["• Every completed job is invoiced or carries a live draft."],
  };

  // Revi's suggested follow-up order — the exact build the Intake → Import
  // card shows (overdue invoices → in-transit vehicles → contact gaps), with
  // chases the owner already checked off excluded. The digest shows the head
  // of the list because the Monday agenda needs the top actions, not all 20;
  // the full list lives in the card and its CSV worklist.
  const order = await buildSuggestedOrder(orgId);
  const CATEGORY_HEAD: Record<string, string> = {
    INVOICE_OVERDUE: "Collect",
    VEHICLE_IN_TRANSIT: "Delivery",
    CONTACT_INFO: "Contact",
  };
  const orderHead = order.rows.slice(0, 5);
  const suggestedOrderLines = orderHead.map((r) => {
    const bits = [CATEGORY_HEAD[r.category] ?? r.category, r.record || r.customer];
    if (r.detail) bits.push(r.detail);
    if (r.since) bits.push(`since ${r.since}`);
    return `• ${bits.join(" — ")}`;
  });
  if (!suggestedOrderLines.length) {
    suggestedOrderLines.push("• All clear — nothing to chase.");
  } else {
    // Money total belongs in the heading so the owner sees the stake up front.
    if (order.rows.length > orderHead.length) {
      suggestedOrderLines.push(`• … and ${order.rows.length - orderHead.length} more in ${ambassadorName}'s full order (download it from Intake → Import).`);
    }
    if (order.dismissedCount > 0) {
      suggestedOrderLines.push(`• ${order.dismissedCount} chase${order.dismissedCount === 1 ? "" : "s"} you checked off are kept out of this list.`);
    }
  }
  const suggestedOrder: DigestSection = {
    heading:
      order.rows.length
        ? `${ambassadorName}'s suggested order (${order.rows.length} follow-up${order.rows.length === 1 ? "" : "s"}${order.summary.invoices ? ` — ${money(order.summary.invoiceTotal)} to collect` : ""})`
        : "No suggested order this week",
    lines: suggestedOrderLines,
  };

  const moneyFound: DigestSection = {
    heading: "Money found / recovered",
    lines: [
      `• Invoiced late-completed work: ${money(Number(dollars?.invoiced_late ?? 0))}`,
      `• Overdue invoices collected: ${money(Number(dollars?.collected_late ?? 0))}`,
      `• Won pipeline: ${money(Number(dollars?.won_pipeline ?? 0))}`,
      `• Total recovered / protected: ${money(recovered)}`,
    ],
  };

  // Plan-signup funnel (spec §3): new submissions this week, who is still
  // waiting for a decision, and what the owner hasn't acted on yet.
  const weekSignups = await sql`
    select contact_name, plan_name, status, source
    from plan_signups
    where organization_id = ${orgId} and submitted_at > now() - interval '7 days'
    order by submitted_at desc
    limit 5`;
  const [signupStats] = await sql`
    select count(*) filter (where submitted_at > now() - interval '7 days')::int as week,
           count(*) filter (where status = 'PENDING')::int as pending,
           count(*) filter (where status = 'CONVERTED' and decided_at > now() - interval '7 days')::int as converted
    from plan_signups where organization_id = ${orgId}`;
  const planSignups: DigestSection = {
    heading: `Plan sign-ups this week (${signupStats?.week ?? 0} new)`,
    lines: weekSignups.map(
      (r) =>
        `• ${r.contact_name} → ${r.plan_name} (via ${(r.source as string).toLowerCase()})${r.status === "PENDING" ? " — awaiting approval" : ""}`,
    ),
  };
  if (!planSignups.lines.length) planSignups.lines.push("• No plan sign-ups this week.");
  planSignups.lines.push(
    Number(signupStats?.pending ?? 0) > 0
      ? `• ${signupStats?.pending} open request(s) still awaiting approval — convert in Enhance → Service plans.`
      : "• Nothing pending — every request has been decided.",
  );

  return { orgName: org.name, openLeaks, pendingDecisions, suggestedOrder, actionItems, approvedThisWeek, unbilled, moneyFound, planSignups };
}

/** Plain-text rendering — the same body goes to WhatsApp and the email fallback.
 *  Framed as the owner's Monday agenda: it doubles as the weekly meeting
 *  structure — leaks → decisions → who owns what → what was approved → money. */
export function renderDigest(d: DigestData): string {
  const section = (s: DigestSection) => `${s.heading}\n${s.lines.join("\n")}`;
  return `CUE weekly agenda — ${d.orgName}\n\n${[d.openLeaks, d.pendingDecisions, d.suggestedOrder, d.actionItems, d.approvedThisWeek, d.planSignups, d.unbilled, d.moneyFound].map(section).join("\n\n")}`;
}

export type DigestBrand = { name: string | null; accent: string | null; logo: string | null; contactPhone: string | null; contactEmail: string | null };

/** Workspace Studio branding for the digest (accent/logo/contacts). */
export async function digestBrand(orgId: string, orgName: string): Promise<DigestBrand> {
  const p = await getWorkspaceProfile(orgId);
  return {
    name: p.brandNameOverride || orgName,
    accent: validAccent(p.brandAccent),
    logo: p.brandLogoUrl,
    contactPhone: p.brandContactPhone,
    contactEmail: p.brandContactEmail,
  };
}

/** HTML rendering — same builder data, four styled cards; plain text is the fallback.
 *  plansUrl, when the org has signup links enabled, appends the tracked
 *  "sign up for a maintenance plan" CTA (spec §3). */
export function renderDigestHtml(d: DigestData, brand?: DigestBrand, plansUrl?: string | null): string {
  const accent = brand?.accent ?? "#7c6cff";
  const brandLine = brand?.name ? esc(brand.name) : "CUE";
  const logo = brand?.logo
    ? `<img src="${esc(brand.logo)}" alt="" style="max-height:40px;max-width:160px;object-fit:contain;margin-bottom:10px;display:block;" />`
    : "";
  const contactBits = [brand?.contactPhone, brand?.contactEmail].filter((x): x is string => Boolean(x)).map(esc).join(" · ");
  const contactFooter = contactBits ? `<div style="font-size:11px;color:#6b7396;margin-top:8px;">${contactBits}</div>` : "";
  const card = (s: DigestSection, accent: string) => `
    <div style="background:#141428;border-radius:12px;padding:18px 20px;margin:0 0 14px;border-left:4px solid ${accent};">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b93b8;margin-bottom:8px;">${esc(s.heading)}</div>
      ${s.lines.map((l) => `<div style="font-size:14px;color:#e8eaf6;padding:3px 0;">${esc(l)}</div>`).join("")}
    </div>`;
  return `<!doctype html><html><body style="margin:0;background:#0b0b18;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      ${logo}
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${accent};margin-bottom:6px;">CUE · weekly digest</div>
      <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:18px;">${esc(d.orgName)}</div>
      ${card(d.openLeaks, "#f87171")}
      ${card(d.pendingDecisions, "#c084fc")}
      ${card(d.suggestedOrder, "#a78bfa")}
      ${card(d.actionItems, "#7c6cff")}
      ${card(d.approvedThisWeek, "#22d3ee")}
      ${card(d.planSignups, "#fbbf24")}
      ${card(d.unbilled, d.unbilled.lines[0]?.startsWith("•") === false ? "#f87171" : "#fbbf24")}
      ${card(d.moneyFound, "#34d399")}
      ${plansUrl ? `<div style="text-align:center;margin-top:18px;"><a href="${esc(plansUrl)}" style="display:inline-block;background:${accent};color:#0b0b18;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;text-decoration:none;">Sign up for a maintenance plan →</a></div>` : ""}
      <div style="font-size:11px;color:#6b7396;margin-top:16px;">Computed from your live records. Manage delivery in Settings → Weekly digest.</div>
      ${contactFooter}
    </div>
  </body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
