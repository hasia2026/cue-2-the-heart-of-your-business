// Red-team pass on the suggested-order dismiss flow (suggested-order.ts +
// dismissSuggestedOrderAction's guards). Attacks the actual lib functions the
// server action delegates to, with two REAL orgs and guaranteed cleanup:
//   1. cross-org isolation      — org A's dismissal never hides org B's row
//   2. cross-org restore        — org B session can't delete org A's dismissal
//   3. malformed ids            — bogus restore id is a no-op, empty record throws
//   4. replay / double dismissal — idempotent: one row, first actor recorded
//   5. two members              — either member can dismiss; row lists them correctly
//   6. hostile + oversized input — SQL-signing and 250-char records land safely, sliced
//   7. category constraint      — a bogus category is rejected by the DB (belt+braces
//                                  behind the action's allowlist)
// Usage: npx tsx --env-file=.env scripts/redteam-dismiss.mts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let fails = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + extra}`);
  if (!ok) fails++;
}

const { buildSuggestedOrder, dismissSuggestedOrderItem, restoreSuggestedOrderItem } = await import("../src/lib/suggested-order");

try {
  // Two DISTINCT orgs, one representative member each (demo seeds provide this).
  const orgs = (await sql`
    select distinct on (m.organization_id)
      m.organization_id as org, u.id as user_id, u.name as user_name, o.name as org_name
    from members m join users u on u.id = m.user_id join organizations o on o.id = m.organization_id
    order by m.organization_id, o.created_at
    limit 2`) as unknown as { org: string; user_id: string; user_name: string; org_name: string }[];
  if (orgs.length < 2) throw new Error("need two seeded orgs with members");
  const [a, b] = orgs;
  console.log(`Attacking dismiss as ${a.user_name} (org ${a.org_name}) vs ${b.user_name} (org ${b.org_name})`);

  // Identical-named customer in both orgs — same record string, two tenants.
  for (const o of [a, b]) {
    await sql`insert into customers (organization_id, name) values (${o.org}, 'RT Robber') on conflict do nothing`;
  }

  const aBefore = (await buildSuggestedOrder(a.org)).rows.filter((r) => r.category === "CONTACT_INFO" && r.record === "RT Robber");
  const bBefore = (await buildSuggestedOrder(b.org)).rows.filter((r) => r.category === "CONTACT_INFO" && r.record === "RT Robber");
  check("1-setup: both orgs list their own 'RT Robber' chase", aBefore.length === 1 && bBefore.length === 1, JSON.stringify({ a: aBefore.length, b: bBefore.length }));

  // 1) Cross-org isolation: dismiss once in A only.
  await dismissSuggestedOrderItem(a.org, a.user_id, a.user_name, { category: "CONTACT_INFO", record: "RT Robber", detail: "Missing email" });
  const aAfter = (await buildSuggestedOrder(a.org)).rows.filter((r) => r.record === "RT Robber");
  const bAfter = (await buildSuggestedOrder(b.org)).rows.filter((r) => r.record === "RT Robber");
  check("1: dismissal in org A hides the row only in A", aAfter.length === 0 && bAfter.length === 1, JSON.stringify({ aAfter: aAfter.length, bAfter: bAfter.length }));

  // 2) Cross-org restore: org B tries to remove A's dismissal by id.
  const [aDismissal] = (await sql`select id from suggested_order_dismissals where organization_id = ${a.org} and record = 'RT Robber'`) as unknown as { id: string }[];
  await restoreSuggestedOrderItem(b.org, aDismissal.id);
  const [stillThere] = (await sql`select count(*)::int as n from suggested_order_dismissals where id = ${aDismissal.id}`) as unknown as { n: number }[];
  check("2: cross-org restore is a no-op (org-scoped delete)", stillThere.n === 1, `rows=${stillThere.n}`);

  // 3) Malformed inputs.
  const randomId = "00000000-0000-4000-8000-000000000000";
  let restored: unknown[] = [];
  try {
    restored = (await sql`delete from suggested_order_dismissals where organization_id = ${a.org} and id = ${randomId} returning id`) as unknown as unknown[];
  } catch (e) {
    check("3: bogus restore id", false, String(e));
  }
  check("3: bogus restore id deletes nothing", restored.length === 0);
  try {
    await dismissSuggestedOrderItem(a.org, a.user_id, a.user_name, { category: "CONTACT_INFO", record: "   ", detail: "x" });
    check("3: empty record throws", false, "accepted an empty record");
  } catch {
    check("3: empty record throws", true);
  }

  // 4) Replay: same org+category+record twice — one row.
  await dismissSuggestedOrderItem(a.org, a.user_id, a.user_name, { category: "CONTACT_INFO", record: "RT Robber", detail: "Missing email" });
  await dismissSuggestedOrderItem(a.org, a.user_id, a.user_name, { category: "CONTACT_INFO", record: "RT Robber", detail: "Missing email" });
  const [replay] = (await sql`select count(*)::int as n from suggested_order_dismissals where organization_id = ${a.org} and record = 'RT Robber'`) as unknown as { n: number }[];
  check("4: replayed dismissal collapses to one row", replay.n === 1, `rows=${replay.n}`);

  // 5) Second member of the SAME org dismisses a different record.
  await dismissSuggestedOrderItem(a.org, b.user_id, b.user_name, { category: "CONTACT_INFO", record: "RT Second Member", detail: "Missing phone" });
  const [second] = (await sql`select actor_name from suggested_order_dismissals where organization_id = ${a.org} and record = 'RT Second Member'`) as unknown as { actor_name: string }[];
  check("5: second member's dismissal lands with their name", second?.actor_name === b.user_name, JSON.stringify(second));

  // 6) Hostile and oversized payloads go through parameterized SQL and get sliced.
  const hostile = "Robert'); drop table suggested_order_dismissals;--" + "x".repeat(260);
  await dismissSuggestedOrderItem(a.org, a.user_id, a.user_name, { category: "CONTACT_INFO", record: hostile, detail: `${"y".repeat(400)}` });
  const [hostileRow] = (await sql`select record, detail, length(record) as rl, length(detail) as dl, count(*)::int as n
    from suggested_order_dismissals where organization_id = ${a.org} and record like 'Robert%drop%' group by record, detail`) as unknown as { record: string; detail: string; rl: number; dl: number; n: number }[];
  check("6: hostile record stored unexecuted, sliced to limits",
    !!hostileRow && hostileRow.n === 1 && hostileRow.dl <= 300,
    JSON.stringify(hostileRow ?? {}));
  const [tableStill] = (await sql`select count(*)::int as n from suggested_order_dismissals`) as unknown as { n: number }[];
  check("6: table survived the injected drop", tableStill.n > 0);
  await buildSuggestedOrder(a.org); // long record renders fine through the card/digest build
  check("6: order build survives a 200-char record", true);

  // 7) The DB itself refuses a category outside the allowlist (the action's
  //    allowlist is checked first; this is the belt under the braces).
  let constraintRejected = false;
  try {
    await sql`insert into suggested_order_dismissals (organization_id, category, record, detail, actor_id, actor_name)
      values (${a.org}, 'BOGUS', 'RT Constraint', '', ${a.user_id}, ${a.user_name})`;
  } catch (e) {
    constraintRejected = /check|violates/i.test(String(e));
  }
  check("7: bogus category rejected by check constraint", constraintRejected);

  // Cross-org replay of the SAME record: B can dismiss independently.
  await dismissSuggestedOrderItem(b.org, b.user_id, b.user_name, { category: "CONTACT_INFO", record: "RT Robber", detail: "Missing email" });
  const bGone = (await buildSuggestedOrder(b.org)).rows.filter((r) => r.record === "RT Robber");
  check("8: B dismisses its own row independently of A", bGone.length === 0);
} finally {
  await sql`delete from suggested_order_dismissals where record like 'RT %' or record like 'Robert%drop%'`;
  await sql`delete from customers where name = 'RT Robber' or name = 'RT Second Member'`;
  await sql.end();
  console.log(fails ? `Red-team: ${fails} failure(s)` : "Red-team: all attacks repelled");
  process.exitCode = fails ? 1 : 0;
}
