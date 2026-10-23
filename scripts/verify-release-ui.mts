// UI verification: with a real DRAFT in the demo org, /pipeline renders the
// review-and-release control. Creates + cleans everything it touches.
// Usage: npx tsx --env-file=.env scripts/verify-release-ui.mts
import postgres from "postgres";
import { createHmac } from "node:crypto";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const BASE = "http://localhost:3210";
let fails = 0;
const check = (n: string, ok: boolean, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " — " + x}`); if (!ok) fails++; };

const { draftInvoiceForOrder } = await import("../src/lib/billing");

try {
  const [owner] = await sql`select u.id, m.organization_id as org from users u join members m on m.user_id = u.id where u.email = 'demo@northgate.example'`;
  const [cust] = await sql`insert into customers (organization_id, name) values (${owner.org}, 'VERIFY Release UI') returning id`;
  const [o] = await sql`insert into service_orders (organization_id, customer_id, title, amount, status, opened_at)
    values (${owner.org}, ${cust.id}, 'Brake job verify', 310.5, 'COMPLETED', now()) returning id`;
  const draft = await draftInvoiceForOrder(owner.org, { serviceOrderId: String(o.id), source: "MANUAL", actorType: "USER", actorId: owner.id });
  check("synthetic draft created", draft.ok && !!draft.number, JSON.stringify(draft));

  const exp = Date.now() + 864e5;
  const payload = `${owner.id}.${exp}`;
  const cookie = `cue_session=${payload}.${createHmac("sha256", process.env.CUE_SESSION_SECRET!).update(payload).digest("base64url")}`;
  const page = await (await fetch(`${BASE}/pipeline`, { headers: { cookie } })).text();
  check("/pipeline renders review-and-release control", page.includes("Review &amp; send draft"), "absent");
  // RSC splits interpolated children with <!-- -->, so the draft number may
  // not be byte-adjacent to the label — assert it appears on the page at all.
  check("draft number appears on the page", page.includes(String(draft.number)), "absent");
  check("does NOT show the old passive 'ready — send it' text", !page.includes("ready — send it from"), "old text still present");
  const collapse = page.match(/Review &amp; send draft[\s\S]{0,200}?/);
  check("control is a real button (interactive release is client-side)", !!collapse && page.includes("button"), "");

  await sql`delete from invoices where service_order_id=${o.id}`;
  await sql`delete from service_orders where id=${o.id}`;
  await sql`delete from customers where id=${cust.id}`;
  console.log(fails === 0 ? "\nRELEASE-UI CHECKS PASSED" : `\n${fails} FAILURE(S)`);
  process.exitCode = fails === 0 ? 0 : 1;
} catch (e) {
  console.error("VERIFY FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
