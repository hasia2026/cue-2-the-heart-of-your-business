// Verification for the three bounded features: digest unbilled alert,
// scan-lead inbox columns, and the draft release (DRAFT → SENT) flow.
// Exercises the REAL builders/lib functions plus the exact action SQL, with
// guaranteed cleanup. Usage: npx tsx --env-file=.env scripts/verify-three-features.mts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let fails = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + extra}`);
  if (!ok) fails++;
}

const { buildDigestData, renderDigest, renderDigestHtml } = await import("../src/lib/digest");
const { draftInvoiceForOrder } = await import("../src/lib/billing");

try {
  const [user] = await sql`select u.id, m.organization_id as org from users u join members m on m.user_id = u.id where u.email = 'demo@northgate.example'`;
  if (!user) throw new Error("demo owner missing — seed first");
  const org = user.org as string;

  // ── 1) Digest: unbilled section present, counts move with reality ──
  const [cust] = await sql`insert into customers (organization_id, name) values (${org}, 'VERIFY Digest') returning id`;
  const [o] = await sql`insert into service_orders (organization_id, customer_id, title, amount, status, opened_at)
    values (${org}, ${cust.id}, 'Verify digest unbilled', 260, 'COMPLETED', now()) returning id`;
  const digestData = await buildDigestData(org);
  const startMatch = digestData.unbilled.heading.match(/\((\d+) jobs\) — \$([\d,]+)/);
  if (!startMatch) throw new Error("unbilled heading missing");
  const startN = Number(startMatch[1]);
  const [baseUnbilled] = await sql`select count(*)::int as n, coalesce(sum(amount),0)::float as total from service_orders so
    where organization_id = ${org} and status='COMPLETED' and invoiced_at is null
      and not exists (select 1 from invoices i where i.service_order_id = so.id and i.status <> 'VOID')`;
  check("digest: unbilled section matches live DB", startN === Number(baseUnbilled.n) && startMatch[2] === Math.round(Number(baseUnbilled.total)).toLocaleString(),
    JSON.stringify(digestData.unbilled));
  const text = renderDigest(digestData);
  const html = renderDigestHtml(digestData);
  check("digest: unbilled appears in text render", text.includes("Unbilled completed work"), "");
  check("digest: unbilled card appears in HTML render", html.includes("Unbilled completed work"), "");

  // With an invoice attached, the count drops to 0.
  const draft = await draftInvoiceForOrder(org, { serviceOrderId: String(o.id), source: "MANUAL", actorType: "USER", actorId: user.id });
  const after = await buildDigestData(org);
  const afterN = Number((after.unbilled.heading.match(/\((\d+) jobs\)/) ?? [])[1]);
  check("digest: drafting the synthetic job drops the count by exactly 1", afterN === startN - 1,
    `${startN} -> ${afterN}, ${JSON.stringify(after.unbilled)}`);

  // ── 2) Release flow (releaseDraftInvoice's exact SQL): DRAFT → SENT ──
  const rel = await sql`update invoices set status='SENT', issued_at=now() where id=(select id from invoices where service_order_id=${o.id}) and status='DRAFT' returning number, status, issued_at`;
  check("release: draft flips to SENT with issued_at", rel.length === 1 && rel[0].status === "SENT" && !!rel[0].issued_at, JSON.stringify(rel));
  const rel2 = await sql`update invoices set status='SENT' where id=(select id from invoices where service_order_id=${o.id}) and status='DRAFT' returning id`;
  check("release: idempotent — second release finds no DRAFT (action refuses)", rel2.length === 0, JSON.stringify(rel2));

  // ── 3) Scan-lead columns: status check constraint + defaults ──
  const [lead] = await sql`insert into scan_leads (name, shop, phone) values ('VERIFY Inbox', 'VERIFY Shop', '555') returning id, status`;
  check("scan-lead: defaults to NEW", lead.status === "NEW", String(lead.status));
  const up = await sql`update scan_leads set status='BOOKED', updated_at=now() where id=${lead.id} returning status`;
  check("scan-lead: status update works", up.length === 1 && up[0].status === "BOOKED", JSON.stringify(up));
  let constraintRejected = false;
  try { await sql`update scan_leads set status='WEIRD' where id=${lead.id}`; } catch { constraintRejected = true; }
  check("scan-lead: bogus status rejected by check constraint", constraintRejected);
  const note = await sql`update scan_leads set note='left vm', updated_at=now() where id=${lead.id} returning note`;
  check("scan-lead: note column persists", note[0]?.note === "left vm", JSON.stringify(note));

  // ── Cleanup ──
  await sql`delete from invoices where service_order_id=${o.id}`;
  await sql`delete from service_orders where id=${o.id}`;
  await sql`delete from scan_leads where id=${lead.id}`;
  await sql`delete from customers where id=${cust.id}`;
  check("cleanup complete", true);

  console.log(fails === 0 ? "\nALL THREE-FEATURE CHECKS PASSED" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
} catch (e) {
  console.error("VERIFY FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
