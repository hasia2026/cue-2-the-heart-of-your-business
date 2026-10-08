#!/usr/bin/env node
// Seeds the GTM scan-call pipeline into the Northgate demo org: the outreach
// prospects from OUTREACH-SCRIPTS.md, tracked as leads with source 'OUTREACH'.
// Idempotent: replaces only that org's OUTREACH-source leads; demo data untouched.
// Usage: node --env-file=.env scripts/seed-pipeline.mjs
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { max: 1, connect_timeout: 20 });

const ORG = "Northgate Auto Group";
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

// [name, channel, interest/next step, est annual value, status, lastContactDaysAgo|null, createdDaysAgo]
// All stored with source='GTM_PROSPECT' so reruns replace exactly this set.
const prospects = [
  ["Fairway Auto Group — Fixed Ops Director", "Outreach DM", "Scan call booked — RO export received", 12000, "QUALIFIED", 1, 12],
  ["Inland Empire 20-group referral (Henderson)", "Referral", "Warm intro; waiting on 30-day RO export", 15000, "CONTACTED", 3, 9],
  ["Magnolia Motors — GM", "Outreach DM", "A2 script replied: asked for sample scan", 9000, "CONTACTED", 2, 7],
  ["Riverside Fleet & Lease — Service Mgr", "LinkedIn DM", "DM sent (A1) — no reply yet, follow-up due", 11000, "NEW", null, 5],
  ["Canyon Auto Family — Fixed Ops Director", "LinkedIn DM", "DM sent (A1) — opened, no reply", 8000, "NEW", null, 4],
  ["Sun City Preowned Superstore — GM", "Outreach DM", "Met at dealer association mixer", 14000, "CONTACTED", 6, 8],
  ["Peak Auto Mall — Used Car Manager", "Outreach DM", "A3 follow-up after group post engagement", 10000, "NEW", null, 2],
  ["Ontario Auto Group — Service Director", "Referral", "Fairway's GM offered intro at 20-group", 13000, "NEW", null, 1],
];

async function main() {
  await sql`begin`;
  try {
    const [org] = await sql`select id from organizations where name = ${ORG}`;
    if (!org) { console.error("Northgate demo org not found — run seed-dealership.mjs first."); process.exit(1); }
    const [assignee] = await sql`select id from employees where organization_id = ${org.id} and name = 'Dana Whitfield'`;

    await sql`delete from leads where organization_id = ${org.id} and source = 'GTM_PROSPECT'`;

    for (const [name, channel, interest, value, status, lastContact, created] of prospects) {
      await sql`
        insert into leads (organization_id, name, source, interest, est_value, status, assigned_to_id, created_at, last_contact_at)
        values (${org.id}, ${name}, 'GTM_PROSPECT', ${channel + " · " + interest}, ${value}, ${status}, ${assignee?.id ?? null}, ${daysAgo(created)}, ${lastContact != null ? daysAgo(lastContact) : null})`;
    }

    await sql`commit`;
    const [n] = await sql`select count(*)::int as n from leads where organization_id = ${org.id} and source = 'GTM_PROSPECT'`;
    console.log(`Seeded GTM pipeline: ${n.n} outreach prospects in ${ORG}.`);
  } catch (e) {
    await sql`rollback`;
    console.error("SEED FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
