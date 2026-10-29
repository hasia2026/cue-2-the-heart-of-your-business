// Round-trip verify for the spreadsheet importer. Drives the SAME code the
// server actions use (src/lib/import-db.ts) against the dev database:
//   parse → guess mapping → dry-run (no writes) → commit (real inserts)
// for a dealership CSV (vehicles/invoices) and an HVAC CSV (service orders /
// agreements, unknown customers auto-created). Everything is namespaced
// IMPORT-VERIFY and deleted afterwards — zero seed pollution.
// Run: npx tsx scripts/verify-import.mts
import postgres from "postgres";

// Same env resolution db.ts uses (DATABASE_URL / SUPABASE_DB_URL).
const url =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  (() => {
    for (const f of [".env", ".env.local"]) {
      try {
        const env = require("node:fs").readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
        const m = env.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=(.+)$/m);
        if (m) return m[1].trim().replace(/^[\"']|[\"']$/g, "");
      } catch {}
    }
    throw new Error("no DATABASE_URL found");
  })();

const sql = postgres(url, { max: 2 });
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // Pure-lib sanity first: parse + validate the HVAC CSV shape offline.
  const { parseCsv, guessMapping, validateRows, fieldsFor } = await import("../src/lib/csv");
  const { dbChecks, importRows, assertKind } = await import("../src/lib/import-db");

  assertKind("SERVICE_ORDERS");
  assertKind("AGREEMENTS");
  const kinds = ["CUSTOMERS", "VEHICLES", "INVOICES", "SERVICE_ORDERS", "AGREEMENTS"] as const;
  check("five import kinds registered", kinds.every((k) => fieldsFor(k).length >= 3));
  check("service_orders maps a work-order export", guessMapping("SERVICE_ORDERS", ["Work Order Description", "Customer", "Status", "Total", "Work Order Date", "Completed Date"]).title === "Work Order Description");
  check("agreements maps a plan export", guessMapping("AGREEMENTS", ["Customer", "Plan", "Contract Value", "Renewal Date", "Status"]).plan_name === "Plan");

  // ── Dev org ──
  const [org] = (await sql`select id, name from organizations order by created_at desc limit 1`) as unknown as {
    id: string; name: string;
  }[];

  // ── 1. HVAC work-order history: unknown customer + auto-create ──
  const hvacCsv = [
    "Work Order Description,Customer,Status,Total,Work Order Date,Completed Date",
    'Blowing warm — evaporator coil,"Nina Torres (IMPORT-VERIFY)",COMPLETED,"$1,080.00",10/01/2026,10/03/2026',
    'Furnace won\'t ignite,"Nina Torres (IMPORT-VERIFY)",COMPLETED,892.50,10/12/2026,10/13/2026',
    'Maintenance visit — filter swap,"Nina Torres (IMPORT-VERIFY)",OPEN,189,,',
  ].join("\n");

  const soHeaders = parseCsv(hvacCsv).headers;
  check("hvac csv parsed 3 rows", parseCsv(hvacCsv).rows.length === 3);
  let soMapping = guessMapping("SERVICE_ORDERS", soHeaders);
  check("hvac auto-maps customer column", soMapping.customer === "Customer" && soMapping.title === "Work Order Description");

  // Dry-run first: by-name kind, customer missing, createMissingCustomers off → blocked.
  const dryNoOpts = await dbChecks("SERVICE_ORDERS", org.id, soMapping, parseCsv(hvacCsv).rows);
  check("dry-run blocks unknown customer when not creating", dryNoOpts.issues.some((i) => i.field === "customer"));

  // Commit with createMissingCustomers on: 3 service orders + 1 new customer.
  const soResult = await importRows(org.id, null, "SERVICE_ORDERS", soMapping, parseCsv(hvacCsv).rows, {
    createMissingCustomers: true,
  });
  check(
    "hvac service orders committed",
    soResult.imported === 3 && soResult.customersCreated === 1,
    `imported=${soResult.imported} customersCreated=${soResult.customersCreated}`,
  );

  const rowsKy = (await sql`
    select so.title, so.status, so.amount, so.opened_at, so.completed_at
    from service_orders so
    join customers c on c.id = so.customer_id
    where so.organization_id = ${org.id} and c.name = 'Nina Torres (IMPORT-VERIFY)'
    order by so.opened_at`) as unknown as {
    title: string; status: string; amount: string; opened_at: string | null; completed_at: string | null;
  }[];
  check("3 structured service-order rows exist", rowsKy.length === 3, `found ${rowsKy.length}`);
  check(
    "money/dates coerced into the record",
    rowsKy[0]?.amount === "1080.00" &&
      rowsKy[0]?.status === "COMPLETED" &&
      !!rowsKy[0]?.opened_at &&
      !!rowsKy[0]?.completed_at &&
      rowsKy[2]?.completed_at === null,
    JSON.stringify(rowsKy[0] ?? {}),
  );

  // ── 2. HVAC maintenance agreements for the same auto-created customer ──
  const agCsv = [
    "Customer,Plan,Contract Value,Start Date,Expiration Date,Status,Notes",
    '"Nina Torres (IMPORT-VERIFY)","Gold Plan","$240/yr",04/01/2026,03/31/2027,ACTIVE,"2 visits per year"',
  ].join("\n");
  const agMapping = guessMapping("AGREEMENTS", parseCsv(agCsv).headers);
  check("agreement auto-maps plan + value", agMapping.plan_name === "Plan" && agMapping.annual_value === "Contract Value");
  const agResult = await importRows(org.id, null, "AGREEMENTS", agMapping, parseCsv(agCsv).rows, {
    createMissingCustomers: true,
  });
  check("agreement committed for existing customer", agResult.imported === 1, `imported=${agResult.imported}`);
  const [agRow] = (await sql`
    select ma.status, ma.plan_name, c.name
    from maintenance_agreements ma
    join customers c on c.id = ma.customer_id
    where ma.organization_id = ${org.id} and c.name = 'Nina Torres (IMPORT-VERIFY)'`) as unknown as {
    status: string; plan_name: string; name: string;
  }[];
  check("agreement row structured", agRow?.status === "ACTIVE" && agRow?.plan_name === "Gold Plan", JSON.stringify(agRow ?? {}));
  // One live agreement per customer — re-committing an ACTIVE plan is skipped, not duplicated.
  const agAgain = await importRows(org.id, null, "AGREEMENTS", agMapping, parseCsv(agCsv).rows, {
    createMissingCustomers: true,
  });
  check("second ACTIVE agreement skipped by one-live rule", agAgain.imported === 0, `imported=${agAgain.imported}`);

  // ── 3. Dealership CSV end-to-end (vehicles + invoices, mixed validity) ──
  const vehCsv = [
    `Stock Number,VIN,Year,Make,Model,List Price,New or Used,Status,Date In Stock`,
    `IV-VERIFY-1,5NPE34AF0HH123456,2017,Hyundai,Elantra,"""$13,450""",USED,IN_TRANSIT,11/02/2026`,
    `IV-VERIFY-2,4T1C11AK0PU654321,2022,Toyota,Camry,27500,NEW,AVAILABLE,`,
    `IV-VERIFY-3,,2022,Honda,Civic,,USED,AVAILABLE,`,
    `IV-VERIFY-4,,1847,Honda,Civic,20000,USED,AVAILABLE,`,
  ].join("\n");
  check("dealership plate list parsed", parseCsv(vehCsv).rows.length === 4);
  const vehMapping = guessMapping("VEHICLES", parseCsv(vehCsv).headers);
  const vehDry = await importRows(org.id, null, "VEHICLES", vehMapping, parseCsv(vehCsv).rows, { dryRun: true });
  check(
    "plate-list dry-run validates shape and blocks absurd year",
    vehDry.imported === 0 && vehDry.issues.some((i) => i.field === "year"),
  );

  // Good subset commits (rows 1-2), bad-row row blocked and counted.
  const goodVehCsv = vehCsv.split("\n").slice(0, 3).join("\n"); // header + 2 good rows
  const vehCommit = await importRows(org.id, null, "VEHICLES", vehMapping, parseCsv(goodVehCsv).rows);
  check("plate list committed", vehCommit.imported === 2, `imported=${vehCommit.imported} skipped=${vehCommit.skipped} issues=${JSON.stringify(vehCommit.issues)}`);
  const vehAgain = await importRows(org.id, null, "VEHICLES", vehMapping, parseCsv(goodVehCsv).rows);
  check("re-import blocked by existing stock numbers", vehAgain.imported === 0 && vehAgain.skipped === 2, `imported=${vehAgain.imported} skipped=${vehAgain.skipped}`);

  const invCsv = [
    "Invoice Number,Customer Name,Invoice Total,Invoice Type,Status,Invoice Date,Due",
    "INV-VERIFY-1,Verify Import Co (NOCUSTOMER),2400.00,DEAL,PAID,10/05/2026,10/20/2026",
  ].join("\n");
  const invMapping = guessMapping("INVOICES", parseCsv(invCsv).headers);
  const invDry = await importRows(org.id, null, "INVOICES", invMapping, parseCsv(invCsv).rows, {
    dryRun: true,
    createMissingCustomers: true,
  });
  check(
    "invoice dry-run promises a customer record for unknown name",
    invDry.customersToCreate.length === 1 &&
      invDry.customersToCreate[0] === "Verify Import Co (NOCUSTOMER)" &&
      invDry.skipped === 0,
    JSON.stringify(invDry.customersToCreate),
  );
  const existingCustomerRow = (await sql`
    select id from customers where organization_id = ${org.id} and lower(name) = 'verify import co (nocustomer)' limit 1`) as unknown as
    { id: string }[];
  let invCommit;
  if (existingCustomerRow.length) {
    invCommit = await importRows(org.id, null, "INVOICES", invMapping, parseCsv(invCsv).rows);
    check("invoice for an existing dealer customer resolves by name", invCommit.imported === 1, `imported=${invCommit?.imported}`);
  } else {
    invCommit = await importRows(org.id, null, "INVOICES", invMapping, parseCsv(invCsv).rows, { createMissingCustomers: true });
    check("unknown customer created with the invoice", invCommit.imported === 1 && invCommit.customersCreated === 1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("VERIFY IMPORT FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Cleanup: everything has our namespace, all org's IMPORT-VERIFY rows are ours.
    try {
      await sql`delete from invoices where organization_id = (select id from organizations order by created_at desc limit 1) and number like '%VERIFY%'`;
      await sql`delete from service_orders so using customers c where so.customer_id = c.id and c.name like '%(IMPORT-VERIFY)%'`;
      await sql`delete from maintenance_agreements ma using customers c where ma.customer_id = c.id and c.name like '%(IMPORT-VERIFY)%'`;
      await sql`delete from vehicles where stock_number like 'IV-VERIFY-%'`;
      await sql`delete from customers where name like '%(IMPORT-VERIFY)%' or name like '%(NOCUSTOMER)%'`;
      console.log("cleanup done");
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
