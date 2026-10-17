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
const args = process.argv.slice(3);
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
  } else if (mode === "org-for-email") {
    // The org the demo owner belongs to (first membership wins).
    const [m] = await sql`
      select m.organization_id, o.name from members m
      join users u on u.id = m.user_id
      join organizations o on o.id = m.organization_id
      where u.email = ${args[0]}
      order by m.organization_id
      limit 1`;
    console.log(JSON.stringify(m ? { found: true, orgId: m.organization_id, name: m.name } : { found: false }));
  } else if (mode === "counts-for-org") {
    const [{ count: customers }] = await sql`select count(*)::int as count from customers where organization_id = ${args[0]}`;
    const [{ count: invoices }] = await sql`select count(*)::int as count from invoices where organization_id = ${args[0]}`;
    console.log(JSON.stringify({ ok: true, customers, invoices }));
  } else if (mode === "ensure-fixture-customer") {
    // e2e fixture: a customer the import's valid row can bill to. Created
    // under the e2e runner's per-run-unique name; removed again at cleanup.
    const exist = await sql`select 1 from customers where organization_id = ${args[0]} and name = ${args[1]}`;
    if (!exist.length) {
      await sql`insert into customers (organization_id, name, type) values (${args[0]}, ${args[1]}, 'RETAIL')`;
      console.log(JSON.stringify({ ok: true, created: true }));
    } else {
      console.log(JSON.stringify({ ok: true, created: false }));
    }
  } else if (mode === "invoice-by-number") {
    const [inv] = await sql`
      select number, amount, status, kind, organization_id, customer_id from invoices where number = ${args[0]} limit 1`;
    console.log(JSON.stringify(inv ? { found: true, ...inv, amount: Number(inv.amount) } : { found: false }));
  } else if (mode === "csv-intake-flag") {
    const [p] = await sql`select intake_state -> 'csvImport' as flag from business_profiles where organization_id = ${args[0]}`;
    console.log(JSON.stringify({ ok: true, value: p?.flag ?? null }));
  } else if (mode === "restore-intake-csv-flag") {
    // Puts business_profiles.intake_state.csvImport back to the pre-test value.
    const prior = args[1] === "null" ? null : JSON.parse(args[1]);
    if (prior == null) {
      await sql`update business_profiles set intake_state = intake_state - 'csvImport' where organization_id = ${args[0]}`;
    } else {
      await sql`update business_profiles set intake_state = jsonb_set(intake_state, '{csvImport}', ${JSON.stringify(prior)}::jsonb, true) where organization_id = ${args[0]}`;
    }
    console.log(JSON.stringify({ ok: true, value: prior }));
  } else if (mode === "cleanup-importer-smoke") {
    // Deletes the throwaway invoices and (if e2e created them) the fixture
    // customers — args alternate: orgId, [invoiceNumber, customerName]...
    for (let i = 1; i + 1 < args.length; i += 2) {
      await sql`delete from invoices where organization_id = ${args[0]} and number = ${args[i]}`;
      await sql`delete from customers where organization_id = ${args[0]} and name = ${args[i + 1]}`;
    }
    const [{ count: customers }] = await sql`select count(*)::int as count from customers where organization_id = ${args[0]}`;
    const [{ count: invoices }] = await sql`select count(*)::int as count from invoices where organization_id = ${args[0]}`;
    console.log(JSON.stringify({ ok: true, customers, invoices }));
  } else {
    console.error("unknown mode: " + mode);
    process.exit(1);
  }
} finally {
  await sql.end();
}
