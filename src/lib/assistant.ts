// CUE AI — grounded assistant. Answers are computed from the org's actual
// records via deterministic intent routing. When data doesn't support an
// answer, it says so. No fabricated business facts, ever.
import { sql } from "./db";

export type AssistantAnswer = {
  answer: string;
  sources: { label: string; kind: string }[];
  suggestions: string[];
};

const SUGGESTED = [
  "What should I focus on today?",
  "What's unbilled in service?",
  "Which leads need follow-up?",
  "Why did the health score change?",
];

export async function answerQuestion(organizationId: string, question: string): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const sources: { label: string; kind: string }[] = [];

  // Focus / attention
  if (/(focus|attention|today|priority|next)/.test(q)) {
    const rows = await sql`
      select i.title, i.severity, i.impact_value from insights i
      where i.organization_id = ${organizationId} and i.status = 'OPEN'
      order by case i.severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, i.impact_value desc nulls last
      limit 3`;
    if (rows.length) {
      sources.push({ label: "Open insights", kind: "QUERY" });
      return {
        answer:
          "Based on your current open insights, the highest-attention items are:\n\n" +
          rows.map((r, i) => `${i + 1}. ${r.title}${r.impact_value ? ` (~$${Math.round(Number(r.impact_value)).toLocaleString()} at stake)` : ""} [${r.severity}]`).join("\n") +
          "\n\nEach has an approved recommendation path in Understand → Execute when you're ready to act.",
        sources,
        suggestions: SUGGESTED,
      };
    }
    return {
      answer: "No open insights right now — the board is clear. Try refreshing intelligence in Understand after new activity lands.",
      sources,
      suggestions: SUGGESTED,
    };
  }

  // Unbilled / billing / revenue leakage
  if (/(unbill|not.*invoice|invoice|billing|collect|overdue|receivab)/.test(q)) {
    const [so] = await sql`
      select count(*)::int as n, coalesce(sum(amount),0)::float as total
      from service_orders where organization_id = ${organizationId} and status='COMPLETED' and invoiced_at is null`;
    const [inv] = await sql`
      select count(*)::int as n, coalesce(sum(amount),0)::float as total
      from invoices where organization_id = ${organizationId} and status='OVERDUE'`;
    sources.push({ label: "service_orders (completed, uninvoiced)", kind: "QUERY" });
    sources.push({ label: "invoices (overdue)", kind: "QUERY" });
    return {
      answer:
        `Unbilled completed service orders: ${so.n} worth $${so.total.toFixed(2)}.\n` +
        `Overdue invoices: ${inv.n} worth $${inv.total.toFixed(2)}.\n\n` +
        (so.n || inv.n
          ? "Both have ready-to-run recovery workflows in Execute — approving the matching recommendation generates the task list."
          : "Nothing outstanding — billing is clean."),
      sources,
      suggestions: SUGGESTED,
    };
  }

  // Leads / follow-up
  if (/(lead|follow.?up|prospect|pipeline)/.test(q)) {
    const rows = await sql`
      select name, est_value, status, created_at from leads
      where organization_id = ${organizationId} and status in ('NEW','CONTACTED')
      order by coalesce(last_contact_at, created_at) asc limit 5`;
    sources.push({ label: "leads (stale first)", kind: "QUERY" });
    if (rows.length) {
      return {
        answer:
          "Leads waiting longest for follow-up:\n\n" +
          rows.map((r) => `• ${r.name} — $${Number(r.est_value ?? 0).toLocaleString()} [${r.status}], waiting since ${new Date(r.created_at).toLocaleDateString()}`).join("\n") +
          "\n\nThe 48-hour recovery sprint recommendation covers these.",
        sources,
        suggestions: SUGGESTED,
      };
    }
    return { answer: "No open leads right now.", sources, suggestions: SUGGESTED };
  }

  // Inventory / aging
  if (/(inventory|aging|days on lot|vehicles|stock|unsold)/.test(q)) {
    const rows = await sql`
      select stock_number, year, make, model, list_price, listed_at from vehicles
      where organization_id = ${organizationId} and status = 'AVAILABLE'
      order by listed_at asc limit 5`;
    sources.push({ label: "vehicles (oldest first)", kind: "QUERY" });
    return {
      answer: rows.length
        ? "Oldest available inventory:\n\n" +
          rows.map((r) => `• ${r.year} ${r.make} ${r.model} (${r.stock_number}) — $${Number(r.list_price ?? 0).toLocaleString()}, listed ${new Date(r.listed_at).toLocaleDateString()} (${Math.floor((Date.now() - new Date(r.listed_at).getTime()) / 864e5)}d)`).join("\n")
        : "No available inventory recorded.",
      sources,
      suggestions: SUGGESTED,
    };
  }

  // Health score
  if (/(health|score|compass)/.test(q)) {
    sources.push({ label: "Business Health (computed)", kind: "CALC" });
    return {
      answer:
        "The Business Health Score is computed live from your records — weighted across revenue, pipeline, operations, inventory, customers, team, and data quality. Each dimension on the Company Compass page shows its own score, evidence, reasoning, and confidence. Open Company Compass to inspect the current breakdown, or click any dimension to see exactly why it scored that way.",
      sources,
      suggestions: SUGGESTED,
    };
  }

  // Policy / knowledge questions — search knowledge items
  const kRows = await sql`
    select title, content, category from knowledge_items
    where organization_id = ${organizationId}
      and (title ilike ${"%" + question.replace(/[%\s]+/g, "%") + "%"}
        or content ilike ${"%" + question.replace(/[%\s]+/g, "%") + "%"})}
    limit 3`;
  if (kRows.length) {
    sources.push({ label: "knowledge_items", kind: "SEARCH" });
    return {
      answer:
        "From your company knowledge:\n\n" +
        kRows.map((k) => `**${k.title}** (${k.category})\n${k.content}`).join("\n\n"),
      sources,
      suggestions: SUGGESTED,
    };
  }

  // Honest fallback
  return {
    answer:
      "I don't have information in your records that answers that. I can answer from actual data on: focus/priorities, unbilled service work, overdue invoices, lead follow-up, inventory aging, and the health score. Ask one of those, or capture the relevant document in Capture first.",
    sources,
    suggestions: SUGGESTED,
  };
}
