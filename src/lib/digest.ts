import { sql } from "./db";

type DigestSection = { heading: string; lines: string[] };

export type DigestData = {
  orgName: string;
  openLeaks: DigestSection;
  pendingDecisions: DigestSection;
  approvedThisWeek: DigestSection;
  moneyFound: DigestSection;
};

/** All digest figures come from the same live tables the dashboard reads. */
export async function buildDigestData(orgId: string): Promise<DigestData> {
  const [org] = await sql`select name from organizations where id = ${orgId}`;
  if (!org) throw new Error("Organization not found");

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

  const moneyFound: DigestSection = {
    heading: "Money found / recovered",
    lines: [
      `• Invoiced late-completed work: ${money(Number(dollars?.invoiced_late ?? 0))}`,
      `• Overdue invoices collected: ${money(Number(dollars?.collected_late ?? 0))}`,
      `• Won pipeline: ${money(Number(dollars?.won_pipeline ?? 0))}`,
      `• Total recovered / protected: ${money(recovered)}`,
    ],
  };

  return { orgName: org.name, openLeaks, pendingDecisions, approvedThisWeek, moneyFound };
}

/** Plain-text rendering — the same body goes to WhatsApp and the email fallback. */
export function renderDigest(d: DigestData): string {
  const section = (s: DigestSection) => `${s.heading}\n${s.lines.join("\n")}`;
  return `CUE weekly digest — ${d.orgName}\n\n${[d.openLeaks, d.pendingDecisions, d.approvedThisWeek, d.moneyFound].map(section).join("\n\n")}`;
}

/** HTML rendering — same builder data, four styled cards; plain text is the fallback. */
export function renderDigestHtml(d: DigestData): string {
  const card = (s: DigestSection, accent: string) => `
    <div style="background:#141428;border-radius:12px;padding:18px 20px;margin:0 0 14px;border-left:4px solid ${accent};">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b93b8;margin-bottom:8px;">${esc(s.heading)}</div>
      ${s.lines.map((l) => `<div style="font-size:14px;color:#e8eaf6;padding:3px 0;">${esc(l)}</div>`).join("")}
    </div>`;
  return `<!doctype html><html><body style="margin:0;background:#0b0b18;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7c6cff;margin-bottom:6px;">CUE · weekly digest</div>
      <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:18px;">${esc(d.orgName)}</div>
      ${card(d.openLeaks, "#f87171")}
      ${card(d.pendingDecisions, "#c084fc")}
      ${card(d.approvedThisWeek, "#22d3ee")}
      ${card(d.moneyFound, "#34d399")}
      <div style="font-size:11px;color:#6b7396;margin-top:16px;">Computed from your live records. Manage delivery in Settings → Weekly digest.</div>
    </div>
  </body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
