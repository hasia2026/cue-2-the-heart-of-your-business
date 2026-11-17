#!/usr/bin/env node
// Idempotent Field Ops demo data for the co-founder walkthrough.
//
// Adds today's scheduled visits and two recent no-shows to Summit (HVAC) and
// Harbor (auto repair). Rows carry a stable marker in appointments.notes, so
// re-running never duplicates them. Times are built in the workspace's own
// timezone, matching the Technician Workday board.
//
// Usage: node --env-file=.env scripts/seed-field-ops-demo.mjs
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const DEMOS = [
  {
    org: "Summit Air Heating & Cooling",
    today: [
      { time: "13:00", title: "Seasonal maintenance", kind: "SERVICE" },
      { time: "15:00", title: "No-cool diagnostic", kind: "SERVICE" },
      { time: "16:30", title: "Replacement quote review", kind: "MEETING" },
    ],
    noShows: [
      { time: "09:00", title: "Maintenance tune-up", kind: "SERVICE" },
      { time: "13:00", title: "AC repair callback", kind: "SERVICE" },
    ],
  },
  {
    org: "Harbor Auto Repair",
    today: [
      { time: "12:30", title: "Brake inspection", kind: "SERVICE" },
      { time: "14:00", title: "A/C diagnostic", kind: "SERVICE" },
      { time: "16:00", title: "60k service", kind: "SERVICE" },
    ],
    noShows: [
      { time: "10:00", title: "Timing belt estimate", kind: "MEETING" },
      { time: "14:00", title: "Check-engine diagnostic", kind: "SERVICE" },
    ],
  },
];

try {
  for (const demo of DEMOS) {
    const [org] = await sql`
      select o.id, coalesce(nullif(bp.timezone, ''), 'America/Chicago') as timezone
      from organizations o
      left join business_profiles bp on bp.organization_id = o.id
      where o.name = ${demo.org}
      limit 1`;
    if (!org) {
      console.log(`skip ${demo.org}: workspace not found`);
      continue;
    }

    // Real demo customers only — skip E2E leftovers and mock intake rows.
    const customers = await sql`
      select id, name from customers
      where organization_id = ${org.id}
        and name not ilike 'E2E%' and name not ilike 'MOCK%'
      order by name asc limit 8`;
    if (!customers.length) {
      console.log(`skip ${demo.org}: no demo customers`);
      continue;
    }

    const rows = [
      ...demo.today.map((a, i) => ({ ...a, status: "SCHEDULED", dayOffset: 0, slot: `today-${i + 1}` })),
      ...demo.noShows.map((a, i) => ({ ...a, status: "NO_SHOW", dayOffset: -1, slot: `no-show-${i + 1}` })),
    ];

    let added = 0;
    for (const [i, row] of rows.entries()) {
      const customer = customers[i % customers.length];
      const marker = `[demo:field-ops] ${row.slot}`;
      const title = `${row.title} — ${customer.name}`;
      const when = row.dayOffset === 0
        ? sql`(date_trunc('day', now() at time zone ${org.timezone}) + ${row.time}::time) at time zone ${org.timezone}`
        : sql`((date_trunc('day', now() at time zone ${org.timezone}) - interval '1 day') + ${row.time}::time) at time zone ${org.timezone}`;

      const result = await sql`
        insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status, notes)
        select ${org.id}, ${customer.id}, ${title}, ${row.kind}, ${when}, ${row.status}, ${marker}
        where not exists (
          select 1 from appointments
          where organization_id = ${org.id} and notes = ${marker}
        )`;
      if (result.count > 0) added += 1;
    }
    console.log(`${demo.org}: ${added} added, ${rows.length - added} already present (${org.timezone})`);
  }
} catch (e) {
  console.error("SEED_FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}