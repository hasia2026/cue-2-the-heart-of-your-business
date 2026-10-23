// Verification: Pipeline invoice-draft money flows — the REAL lib functions
// (src/lib/billing.ts) against the real DB, then full cleanup.
// Usage: node --env-file=.env npx tsx scripts/verify-invoice-drafts.mts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let fails = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + extra}`);
  if (!ok) fails++;
}

const { draftInvoiceForOrder, autoDraftOnCompletion } = await import("../src/lib/billing");

try {
  const [user] = await sql`select u.id, m.organization_id as org from users u join members m on m.user_id = u.id where u.email = 'demo@northgate.example'`;
  if (!user) throw new Error("demo owner missing — seed first");
  const org = user.org as string;

  // Two fresh test orders for one throwaway customer.
  const [cust] = await sql`insert into customers (organization_id, name) values (${org}, 'VERIFY Draft Flow') returning id`;
  const mkOrder = async () =>
    (await sql`insert into service_orders (organization_id, customer_id, title, amount, status, opened_at)
      values (${org}, ${cust.id}, 'Verify draft flow', 412.5, 'IN_PROGRESS', now()) returning id, title, amount`)[0];
  const o1 = await mkOrder();
  const o2 = await mkOrder();

  // 1) Auto-draft on an IN_PROGRESS order must refuse (completion hook only fires when done).
  const early = await autoDraftOnCompletion(org, String(o1.id));
  check("auto-draft refuses IN_PROGRESS order", !early.ok && early.reason === "ORDER_INCOMPLETE", JSON.stringify(early));

  // 2) Completion + auto-draft → DRAFT invoice with SOP due window.
  await sql`update service_orders set status = 'COMPLETED', completed_at = now() where id = ${o1.id}`;
  const auto = await autoDraftOnCompletion(org, String(o1.id));
  check("auto-draft on completion creates QD-… draft", auto.ok && typeof auto.number === "string" && auto.number.startsWith("QD-"), JSON.stringify(auto));
  const [inv1] = await sql`select number, status, amount, due_at, customer_id, service_order_id from invoices where service_order_id = ${o1.id} and status <> 'VOID'`;
  check("draft row: DRAFT + right amount/customer/order",
    inv1?.status === "DRAFT" && Number(inv1?.amount) === 412.5 && String(inv1?.customer_id) === String(cust.id) && String(inv1?.service_order_id) === String(o1.id),
    JSON.stringify(inv1));
  check("draft due_at set from billing SOP window", !!inv1?.due_at, "due_at missing");

  // 3) Idempotent: re-running completion auto-draft must NOT create a second invoice.
  const again = await autoDraftOnCompletion(org, String(o1.id));
  const [n1] = await sql`select count(*)::int as n from invoices where service_order_id = ${o1.id}`;
  check("auto-draft is idempotent (DRAFT_EXISTS, still 1 invoice)", !again.ok && again.reason === "DRAFT_EXISTS" && n1.n === 1, `${again.reason}, count ${n1.n}`);

  // 4) Manual path on the same order also refused (no second draft ever).
  const manualDup = await draftInvoiceForOrder(org, { serviceOrderId: String(o1.id), source: "MANUAL", actorType: "USER", actorId: user.id });
  const [n2] = await sql`select count(*)::int as n from invoices where service_order_id = ${o1.id}`;
  check("manual draft on drafted order refuses (no double-draft)", !manualDup.ok && manualDup.reason === "DRAFT_EXISTS" && n2.n === 1, JSON.stringify(manualDup));

  // 5) Manual path on a completed, never-billed order creates its own draft + audit trail.
  await sql`update service_orders set status = 'COMPLETED', completed_at = now() where id = ${o2.id}`;
  const manual = await draftInvoiceForOrder(org, { serviceOrderId: String(o2.id), source: "MANUAL", actorType: "USER", actorId: user.id });
  check("manual draft creates draft for unbilled completed order", manual.ok && typeof manual.number === "string" && manual.number.startsWith("QD-"), JSON.stringify(manual));
  const [aud] = await sql`select action from audit_events where target_id = ${o2.id} and action = 'DRAFT_INVOICE_CREATED'`;
  check("manual draft logged to audit trail", !!aud, "no DRAFT_INVOICE_CREATED row");
  const [audAuto] = await sql`select action from audit_events where target_id = ${o1.id} and action = 'DRAFT_INVOICE_CREATED'`;
  check("auto-draft logged to audit trail", !!audAuto, "no DRAFT_INVOICE_CREATED row");

  // Nothing auto-sends: both drafts must still be DRAFT.
  const [sent] = await sql`select count(*)::int as n from invoices where service_order_id in ${sql([o1.id, o2.id])} and status <> 'DRAFT' and status <> 'VOID'`;
  check("draft-first guarantee: nothing sent/paid automatically", sent.n === 0, `${sent.n} non-draft rows`);

  // Cleanup — sweep the audit rows FIRST, then the invoices/orders/customer.
  await sql`delete from audit_events where target_id in ${sql([o1.id, o2.id])} and action = 'DRAFT_INVOICE_CREATED'`;
  const del = await sql`delete from invoices where service_order_id in ${sql([o1.id, o2.id])} returning id`;
  await sql`delete from service_orders where id in ${sql([o1.id, o2.id])}`;
  await sql`delete from customers where id = ${cust.id}`;
  check("cleanup complete", del.length === 2, `${del.length}/2 invoices removed`);

  console.log(fails === 0 ? "\nALL INVOICE-DRAFT CHECKS PASSED" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
} catch (e) {
  console.error("VERIFY FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
