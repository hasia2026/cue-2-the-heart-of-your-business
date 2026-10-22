#!/usr/bin/env node
// DB probe for scripts/verify-plan-signups.mjs — single-line JSON on stdout
// (the caller takes the last line, e2e.mjs convention). Run with --env-file=.env.
//
// Modes:
//   org-for-email <email>                    → { found, orgId, orgName }
//   seed-plan <orgId> <name>                 → { ok, planId }
//   signup-row <orgId> <sourceRef>           → { found, signupId, status, source,
//                                                sourceRef, planName, contactEmail,
//                                                customerMatched }
//   signup-row-by-id <orgId> <signupId>      → { status, customerMatched, customerEmail,
//                                                agreementStatus, agreementNotes,
//                                                auditConverted }
//   cleanup <orgId> <ref> <planName> <email> <signupId>
//                                            → removes the created customer,
//                                              agreement, signup rows and the
//                                              verify plan; { ok, remaining* }
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const [mode, ...args] = process.argv.slice(2);

try {
  if (mode === "org-for-email") {
    const [row] = await sql`
      select o.id as org_id, o.name
      from organizations o
      join members m on m.organization_id = o.id
      join users u on u.id = m.user_id
      where lower(u.email) = lower(${args[0]})
      limit 1`;
    console.log(JSON.stringify(
      row ? { found: true, orgId: row.org_id, orgName: row.name } : { found: false },
    ));
  } else if (mode === "seed-plan") {
    const [orgId, name] = args;
    const [row] = await sql`
      insert into service_plans (organization_id, name, blurb, annual_value, featured, active)
      values (${orgId}, ${name}, 'E2E verification plan — safe to ignore', 600, false, true)
      returning id`
      .catch(async () => {
        // Unique-name collision → the plan already exists; reuse its id.
        const [x] = await sql`
          update service_plans set annual_value = 600, active = true
          where organization_id = ${orgId} and name = ${name}
          returning id`;
        return [x];
      });
    console.log(JSON.stringify(row ? { ok: true, planId: row.id } : { ok: false }));

  } else if (mode === "signup-row") {
    const [orgId, ref] = args;
    const [r] = await sql`
      select id, status, source, source_ref, plan_name,
             contact_email, customer_matched
      from plan_signups
      where organization_id = ${orgId} and source_ref = ${ref}
      order by submitted_at desc limit 1`;
    console.log(JSON.stringify(r
      ? {
        found: true, signupId: r.id, status: r.status, source: r.source,
        sourceRef: r.source_ref, planName: r.plan_name,
        contactEmail: r.contact_email, customerMatched: r.customer_matched,
      }
      : { found: false }));

  } else if (mode === "signup-row-by-id") {
    const [orgId, id] = args;
    const [r] = await sql`
      select p.status, p.customer_matched, c.email as customer_email,
             ma.status as agreement_status, ma.notes as agreement_notes,
             (select count(*) > 0 from audit_events
              where organization_id = ${orgId} and target_id = ${id}
                and action = 'PLAN_SIGNUP_CONVERTED') as audit_converted
      from plan_signups p
      left join customers c on c.id = p.customer_id
      left join maintenance_agreements ma on ma.id = p.agreement_id
      where p.id = ${id} and p.organization_id = ${orgId}`;
    console.log(JSON.stringify(r
      ? {
        status: r.status, customerMatched: r.customer_matched,
        customerEmail: r.customer_email ?? null,
        agreementStatus: r.agreement_status ?? null,
        agreementNotes: r.agreement_notes ?? null,
        auditConverted: r.audit_converted,
      }
      : { found: false }));

  } else if (mode === "cleanup") {
    const [orgId, ref, planName, email] = args;
    await sql`delete from maintenance_agreements
      where organization_id = ${orgId} and notes like ${`%${ref}%`}`;
    await sql`delete from customers
      where organization_id = ${orgId} and lower(email) = lower(${email})`;
    await sql`delete from plan_signups
      where organization_id = ${orgId} and (source_ref = ${ref} or lower(contact_email) = lower(${email}))`;
    const [plan] = await sql`delete from service_plans
      where organization_id = ${orgId} and name = ${planName} returning id`;

    const [s] = await sql`
      select count(*) as n from plan_signups
      where organization_id = ${orgId} and (source_ref = ${ref} or lower(contact_email) = lower(${email}))`;
    const [a] = await sql`
      select count(*) as n from maintenance_agreements
      where organization_id = ${orgId} and notes like ${`%${ref}%`}`;
    const [c] = await sql`
      select count(*) as n from customers
      where organization_id = ${orgId} and lower(email) = lower(${email})`;
    const [p] = await sql`
      select count(*) as n from service_plans
      where organization_id = ${orgId} and name = ${planName}`;

    console.log(JSON.stringify({
      ok: Number(p?.n) === 0,
      remainingSignups: Number(s?.n), remainingAgreements: Number(a?.n),
      remainingCustomers: Number(c?.n), remainingPlans: Number(p?.n),
    }));
  } else {
    console.log(JSON.stringify({ error: `unknown mode ${mode}` }));
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  console.log(JSON.stringify({ error: e.message }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
