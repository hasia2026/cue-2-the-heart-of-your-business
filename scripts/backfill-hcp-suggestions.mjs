/**
 * Backfills attribution fields added in migrate-hcp-suggestions.sql, for both
 * demo orgs, so the new Pipeline board reads real numbers instead of zeros.
 *
 * - leads.source_origin / source_status: derived from each lead's own
 *   source and lifecycle status.
 * - service_orders.sold_by: for the dealership's service customers, the
 *   consultant who closed the related deal when one exists, else the tech
 *   who is ASSIGNED the service_order-derived tasks.
 * - service_orders.service_type / deals.service_type: labelled from the
 *   title text (diagnostic vs. replacement vs. maintenance) so the
 *   "how many diagnostics vs. upgrades vs. panel swaps" probe has data.
 * - deals.origin_lead_id: nearest lead for the same customer created before
 *   the deal, so source-ROI grouping has something to join on.
 *
 * Usage: node --env-file=.env scripts/backfill-hcp-suggestions.mjs
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

const SERVICE_TYPE_RULES = [
  ["EV charger", /ev charger|evse|charger install/i],
  ["Panel swap", /panel (replace|swap|upgrade)|service upgrade/i],
  ["Diagnostic", /diagnos|no heat|no cool|not cooling|not heating/i],
  ["Maintenance", /maintenance|tune-?up|annual/i],
  ["Replacement", /replace|install|new (unit|furnace|ac|system)/i],
];

function serviceTypeFromText(text) {
  for (const [label, re] of SERVICE_TYPE_RULES) {
    if (re.test(text)) return label;
  }
  return "Other";
}

try {
  // 1. leads.source_origin / source_status — derive per-lead.
  const leadRows = await sql`
    select id, source, status, est_value from leads where organization_id is not null`;
  for (const l of leadRows) {
    const origin = l.source ?? "WEB";
    // Won → CLOSED_WON, Lost → CLOSED_LOST, anything mid-lifecycle → OPEN.
    const lifecycle =
      l.status === "WON" ? "CLOSED_WON" : l.status === "LOST" ? "CLOSED_LOST" : "OPEN";
    const st = serviceTypeFromText(`${l.interest ?? ""}`);
    // Follow-up SLA: open leads with no recent contact get a 3-day deadline
    // from now — a few land overdue immediately so the red badge shows.
    const staleDays = Math.floor((Date.now() - new Date(l.last_contact_at ?? 0).getTime()) / 864e5);
    const nextAction =
      lifecycle === "OPEN" && (staleDays > 5 || !l.last_contact_at)
        ? new Date(Date.now() - Math.floor(Math.random() * 6) * 864e5) // -5d..today → overdue or due today
        : lifecycle === "OPEN"
          ? new Date(Date.now() + 4 * 864e5)
          : null;
    await sql`
      update leads set source_origin = ${origin}, source_status = ${lifecycle}, service_type = ${st},
        next_action_at = ${nextAction}
      where id = ${l.id}`;
  }
  console.log(`leads backfilled: ${leadRows.length}`);

  // 2. service_orders.sold_by / service_type — dealership only has the
  //    relates-to-a-deal case; HVAC uses task assignees.
  // Deals don't reference service orders directly (service_order_id is on
  // invoices, not deals) — joining via the shared customer is the practical
  // proxy a real DMS would replace with a proper RO→deal link.
  const soRows = await sql`
    select s.id, s.organization_id, s.title, s.customer_id, d.sold_by_id
    from service_orders s
    left join invoices i on i.service_order_id = s.id
    left join deals d on d.customer_id = s.customer_id and d.sold_by_id is not null
    where s.sold_by is null`;
  for (const s of soRows) {
    let soldBy = s.sold_by_id ?? null;
    if (!soldBy) {
      // Fall back to a task assignee — that's who "did" it, which we mark
      // as tech-completed rather than tech-sold.
      const [t] = await sql`
        select assignee_id from tasks
        where project_id is null and title ilike ${"%" + s.title.slice(0, 20) + "%"}
        limit 1`;
      if (t?.assignee_id) {
        await sql`
          update service_orders set sold_by = ${t.assignee_id}, sold_by_is_tech = true
          where id = ${s.id}`;
        continue;
      }
    }
    if (soldBy) {
      await sql`
        update service_orders set sold_by = ${soldBy}, sold_by_is_tech = false where id = ${s.id}`;
    }
    const st = serviceTypeFromText(s.title ?? "");
    await sql`update service_orders set service_type = ${st} where id = ${s.id} and service_type is null`;
  }
  console.log(`service_orders backfilled: ${soRows.length}`);

  // 3. deals.service_type + origin_lead_id.
  const dealRows = await sql`
    select d.id, d.customer_id, d.created_at, d.status, c.name from deals d
    join customers c on c.id = d.customer_id
    where d.service_type is null or d.origin_lead_id is null`;
  for (const d of dealRows) {
    const st = serviceTypeFromText(d.name ?? "");
    await sql`update deals set service_type = ${st} where id = ${d.id} and service_type is null`;
    if (!d.origin_lead_id) {
      const [lead] = await sql`
        select id from leads
        where customer_id = ${d.customer_id} and created_at <= ${d.created_at}
        order by created_at desc limit 1`;
      if (lead) {
        await sql`update deals set origin_lead_id = ${lead.id} where id = ${d.id}`;
      }
    }
  }
  console.log(`deals backfilled: ${dealRows.length}`);

  // 4. Summary.
  const [summary] = await sql`
    select
      (select count(*) from leads where source_origin is not null)::int as leads,
      (select count(*) from service_orders where sold_by is not null)::int as so_sold,
      (select count(*) from service_orders where service_type is not null)::int as so_typed,
      (select count(*) from deals where origin_lead_id is not null)::int as deals_linked,
      (select count(*) from deals where service_type is not null)::int as deals_typed`;
  console.log("summary:", summary);
  process.exit(0);
} catch (e) {
  console.error("BACKFILL FAILED:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
