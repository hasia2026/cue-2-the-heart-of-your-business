#!/usr/bin/env node
// E2E helper — reads CUE's live database without going through HTTP.
// Usage: node --env-file=.env scripts/e2e-db-probe.mjs <mode>
// Modes (single-line JSON on stdout; e2e.mjs takes the LAST line):
//   insights   — { renewal, proposal, titles[] } for Summit Air
//   customer   — { id, locale } for Ms. Yolanda Reyes (quote fixture)
//   fixtures   — idempotently seed the agreement + locale fixtures; prints { ok: true }
// Standalone so scripts/e2e.mjs can execSync it from any shell (inline
// multi-line node -e is unreliable under Git Bash/Windows).
import postgres from "postgres";

const mode = process.argv[2] ?? "insights";
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

async function summitOrg() {
  const [org] = await sql`select id from organizations where name = 'Summit Air Heating & Cooling'`;
  return org ?? null;
}

try {
  if (mode === "fixtures") {
    const org = await summitOrg();
    if (!org) {
      console.log(JSON.stringify({ ok: false, reason: "no Summit Air org — run seed-hvac first" }));
    } else {
      await sql`
        update customers set preferred_locale = 'es'
        where organization_id = ${org.id} and name = 'Ms. Yolanda Reyes' and preferred_locale is null`;
      await sql`
        update customers set preferred_locale = 'vi'
        where organization_id = ${org.id} and name = 'The Pham Family' and preferred_locale is null`;
      await sql`
        insert into maintenance_agreements (organization_id, customer_id, plan_name, annual_value, starts_at, ends_at, status)
        select ${org.id}, c.id, 'Residential upkeep plan', 249, now() - interval '341 days', now() + interval '24 days', 'ACTIVE'
        from customers c where c.organization_id = ${org.id} and c.name = 'The Alvarez Family'
        on conflict do nothing`;
      console.log(JSON.stringify({ ok: true }));
    }
  } else if (mode === "insights") {
    const org = await summitOrg();
    if (!org) {
      console.log(JSON.stringify({ renewal: false, proposal: false, titles: [], reason: "no Summit Air org" }));
    } else {
      const rows = await sql`
        select title from insights
        where organization_id = ${org.id} and status = 'OPEN'`;
      const t = rows.map((r) => r.title).join(" | ");
      console.log(JSON.stringify({
        renewal: /maintenance agreement.*up for renewal/.test(t),
        proposal: /behaving like maintenance-plan fits/.test(t),
        titles: rows.map((r) => r.title.slice(0, 60)),
      }));
    }
  } else if (mode === "customer") {
    const org = await summitOrg();
    if (!org) {
      console.log(JSON.stringify(null));
    } else {
      const [c] = await sql`
        select id, preferred_locale from customers
        where organization_id = ${org.id} and name = 'Ms. Yolanda Reyes'`;
      console.log(JSON.stringify(c ? { id: c.id, locale: c.preferred_locale } : null));
    }
  } else {
    console.error("unknown mode: " + mode);
    process.exit(1);
  }
} finally {
  await sql.end();
}
