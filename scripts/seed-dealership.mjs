#!/usr/bin/env node
// Seeds CUE with the AUTO DEALERSHIP industry-pack demo:
// "Northgate Auto Group" — a franchise dealership with real operational problems
// the intelligence engine can detect (unbilled service work, stale leads, aging
// inventory, finance bottlenecks). Idempotent: wipes demo org first.
// Usage: node --env-file=.env scripts/seed-dealership.mjs
import { scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { max: 1, connect_timeout: 20 });

const DEMO_ORG = "Northgate Auto Group";
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

async function main() {
  await sql`begin`;
  try {
    // reset previous demo
    await sql`delete from organizations where name = ${DEMO_ORG}`;

    const [org] = await sql`
      insert into organizations (name, is_demo) values (${DEMO_ORG}, true) returning id`;
    const orgId = org.id;

    // Owner is upserted too: deleting the demo org cascades members but not
    // users, so a plain insert would trip users_email_key on every rerun.
    const [ownerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('demo@northgate.example', 'Dana Whitfield (Demo)', ${"seeded-demo-no-login"})
      on conflict (email) do update set name = excluded.name
      returning id`;
    const existingMember = await sql`select id from members where organization_id = ${orgId} and user_id = ${ownerUser.id}`;
    if (!existingMember.length) {
      await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${ownerUser.id}, 'OWNER')`;
    }

    // Role demo accounts — hashed with the real scheme so placeholders can
    // never authenticate. Stable demo credentials (documented in PRODUCT-TOUR):
    //   ADMIN  marcus@northgate.example / demo-admin-2026
    //   MEMBER tom@northgate.example   / demo-member-2026
    const demoHash = (p) => {
      const salt = randomBytes(16).toString("hex");
      return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
    };
    // Upsert by email so rerunning the seed against a live DB never trips
    // the users_email_key constraint on prior demo accounts.
    const [adminUser] = await sql`
      insert into users (email, name, password_hash)
      values ('marcus@northgate.example', 'Marcus Lee (Demo)', ${demoHash("demo-admin-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${adminUser.id}, 'ADMIN')`;
    const [memberUser] = await sql`
      insert into users (email, name, password_hash)
      values ('tom@northgate.example', 'Tom Alvarez (Demo)', ${demoHash("demo-member-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${memberUser.id}, 'MEMBER')`;

    const [profile] = await sql`
      insert into business_profiles (organization_id, name, industry, size, locations, business_model, offerings, target_customers, mission, values_text, operational_priorities)
      values (${orgId}, ${DEMO_ORG}, 'AUTO_DEALERSHIP', '11-50', 'Riverside, CA — 1 lot + service center',
        'Franchise new & used vehicle sales with fixed-ops service department',
        E'New vehicle sales\nUsed vehicle sales\nCertified pre-owned\nService & repair\nParts & accessories\nFinancing & F&I',
        'Local retail buyers, fleet buyers, service-only customers within 30 miles',
        'Be the most trusted dealership in the Inland Empire.',
        'Integrity, Speed, Transparency, Community',
        'Reduce unsold inventory age, close service follow-ups faster, protect CSI scores')
      returning id`;

    await sql`
      insert into goals (profile_id, title, detail, horizon) values
      (${profile.id}, 'Cut average used-inventory days-on-lot below 45', 'Reprice aging units weekly; wholesale anything past 75 days.', 'QUARTER'),
      (${profile.id}, 'Lift service-to-sales retention', 'Every service visit gets a trade-in conversation.', 'YEAR'),
      (${profile.id}, 'Zero unbilled completed service orders', 'Invoice within 24h of RO completion.', 'QUARTER')`;

    // Departments
    const deptRows = await sql`
      insert into departments (organization_id, name, description) values
      (${orgId}, 'Sales', 'New & used vehicle sales'),
      (${orgId}, 'Service', 'Fixed operations — service & repair'),
      (${orgId}, 'F&I', 'Finance & insurance office'),
      (${orgId}, 'Admin', 'Accounting, HR, compliance')
      returning id, name`;
    const dept = Object.fromEntries(deptRows.map(r => [r.name, r.id]));

    // Employees
    const empRows = await sql`
      insert into employees (organization_id, name, title, department_id, email, skills, responsibilities, hire_date) values
      (${orgId}, 'Dana Whitfield', 'General Manager', ${dept.Admin}, 'dana@northgate.example', 'leadership,operations,finance', 'P&L, staffing, vendor relations', ${daysAgo(1200)}::date),
      (${orgId}, 'Marcus Lee', 'Sales Manager', ${dept.Sales}, 'marcus@northgate.example', 'negotiation,desking,leasing', 'Sales floor, deal desk, trade appraisals', ${daysAgo(900)}::date),
      (${orgId}, 'Priya Patel', 'Senior Sales Consultant', ${dept.Sales}, 'priya@northgate.example', 'retail sales,crm', 'New & used retail deals, follow-up', ${daysAgo(400)}::date),
      (${orgId}, 'Tom Alvarez', 'Sales Consultant', ${dept.Sales}, 'tom@northgate.example', 'retail sales,internet leads', 'Internet leads, walk-ins', ${daysAgo(150)}::date),
      (${orgId}, 'Rachel Kim', 'Service Manager', ${dept.Service}, 'rachel@northgate.example', 'fixed ops,dispatch,warranty', 'Service lane, RO flow, technician staffing', ${daysAgo(800)}::date),
      (${orgId}, 'Jorge Santos', 'Master Technician', ${dept.Service}, 'jorge@northgate.example', 'diagnostics,electrical', 'Diagnostics bay, training juniors', ${daysAgo(1100)}::date),
      (${orgId}, 'Amy Chen', 'Service Advisor', ${dept.Service}, 'amy@northgate.example', 'csi,communication', 'RO write-up, status calls, CSI follow-up', ${daysAgo(300)}::date),
      (${orgId}, 'Kevin Osei', 'F&I Manager', ${dept["F&I"]}, 'kevin@northgate.example', 'lending,compliance,products', 'Lender menu, compliance, product sales', ${daysAgo(600)}::date)
      returning id, name`;
    const emp = Object.fromEntries(empRows.map(r => [r.name, r.id]));
    await sql`update employees set manager_id = ${emp["Dana Whitfield"]} where name in ('Marcus Lee','Rachel Kim','Kevin Osei')`;
    await sql`update employees set manager_id = ${emp["Marcus Lee"]} where name in ('Priya Patel','Tom Alvarez')`;
    await sql`update employees set manager_id = ${emp["Rachel Kim"]} where name in ('Jorge Santos','Amy Chen')`;

    // Customers (~18)
    const custNames = [
      ["Henderson Family LLC", "RETAIL", "Repeat service customer — 3 vehicles in household."],
      ["Riverside Unified School District", "FLEET", "Fleet account: 12 vans, annual PM contract."],
      ["Sunrise Bakery", "WHOLESALE", "Delivery van fleet, cash buyer."],
      ["The Nguyen Family", "RETAIL", "Vietnamese-speaking household; prefers Vietnamese comms."],
      ["Omar Haddad", "RETAIL", "Lease returning soon — sedan swap candidate."],
      ["Grace Okafor", "RETAIL", "Referred by Hendersons."],
      ["Vista Medical Group", "FLEET", "3 SUVs, awaiting fleet quote."],
      ["Luis Ramirez", "RETAIL", "Sub-600 credit — special finance desk."],
      ["Emily & Jack Turner", "RETAIL", "First-time buyers, need full F&I walkthrough."],
      ["Kenji Watanabe", "RETAIL", "Enthusiast — waits for specific trim."],
      ["Mrs. Dorothy Bell", "RETAIL", "Service-only, senior, prefers phone calls."],
      ["Canyon CrossFit", "WHOLESALE", "2 pickup trucks, budget cap $38k each."],
      ["Fatima Al-Rashid", "RETAIL", "Arabic-speaking; lease vs buy comparison."],
      ["Steve Boozer", "RETAIL", "Declined PDI add-on last visit — revisit gently."],
      ["Isabella Moretti", "RETAIL", "Trade-in appraisal scheduled."],
      ["Riverside Pest Co", "FLEET", "4 work vans, needs upfitting quotes."],
      ["Hank Murphy", "RETAIL", "Cash buyer, negotiates hard."],
      ["Yuki Tanaka", "RETAIL", "International license — needs financing guidance."],
    ];
    const custRows = [];
    for (let i = 0; i < custNames.length; i++) {
      const [name, type, notes] = custNames[i];
      const rows = await sql`
        insert into customers (organization_id, name, type, notes, phone, created_at)
        values (${orgId}, ${name}, ${type}, ${notes}, ${`559-555-01${String(i).padStart(2, "0")}`}, ${daysAgo(300 - i * 12)})
        returning id, name`;
      custRows.push(rows[0]);
    }
    const cust = Object.fromEntries(custRows.map(r => [r.name, r.id]));
    const custByIndex = custRows.map(r => r.id);

    // Vehicles (~24) — mix of new/used, some aging, some sold
    const vehicles = [
      ["N-2401", 2026, "Toyota", "Camry", "SE", "NEW", "AVAILABLE", 32490, 29100, 14],
      ["N-2402", 2026, "Toyota", "RAV4", "XLE", "NEW", "AVAILABLE", 34780, 31200, 21],
      ["N-2403", 2026, "Honda", "Accord", "Sport", "NEW", "AVAILABLE", 33990, 30500, 30],
      ["N-2404", 2026, "Honda", "CR-V", "EX-L", "NEW", "RESERVED", 36420, 32800, 9],
      ["N-2405", 2026, "Ford", "F-150", "XLT", "NEW", "AVAILABLE", 52480, 47500, 52],
      ["U-8801", 2023, "Toyota", "Corolla", "LE", "USED", "AVAILABLE", 21950, 18700, 38],
      ["U-8802", 2022, "Honda", "Civic", "EX", "USED", "AVAILABLE", 23400, 19900, 61],
      ["U-8803", 2021, "Ford", "Explorer", "XLT", "USED", "AVAILABLE", 27850, 24100, 68],
      ["U-8804", 2023, "Hyundai", "Tucson", "SEL", "USED", "AVAILABLE", 25900, 22300, 44],
      ["U-8805", 2020, "Ford", "Transit", "150 Cargo", "USED", "AVAILABLE", 28900, 25400, 47],
      ["U-8806", 2022, "Chevrolet", "Silverado", "LT", "USED", "AVAILABLE", 41500, 36900, 55],
      ["U-8807", 2023, "Toyota", "Tacoma", "SR5", "USED", "SOLD", 38900, 34200, null],
      ["U-8808", 2021, "Nissan", "Altima", "SV", "USED", "AVAILABLE", 19800, 16800, 72],
      ["U-8809", 2024, "Kia", "Sportage", "LX", "USED", "AVAILABLE", 27450, 24800, 18],
      ["U-8810", 2020, "Chrysler", "Pacifica", "Touring L", "USED", "AVAILABLE", 24800, 21900, 64],
      ["U-8811", 2022, "Subaru", "Outback", "Premium", "USED", "SOLD", 29850, 26300, null],
      ["U-8812", 2023, "Toyota", "Highlander", "XLE", "USED", "AVAILABLE", 41200, 37400, 33],
      ["U-8813", 2019, "Ford", "F-250", "XL Work Truck", "USED", "AVAILABLE", 32900, 29800, 58],
    ];
    const vehRows = [];
    for (const [stock, year, make, model, trim, kind, status, price, cost, days] of vehicles) {
      const rows = await sql`
        insert into vehicles (organization_id, stock_number, year, make, model, trim, kind, status, list_price, cost, listed_at, sold_at)
        values (${orgId}, ${stock}, ${year}, ${make}, ${model}, ${trim}, ${kind}, ${status}, ${price}, ${cost},
          ${days == null ? daysAgo(40) : daysAgo(days)}, ${status === "SOLD" ? daysAgo(10) : null})
        returning id, stock_number`;
      vehRows.push(rows[0]);
    }
    const veh = Object.fromEntries(vehRows.map(r => [r.stock_number, r.id]));

    // Deals — includes the finance bottleneck + lost deals
    const deals = [
      [cust["The Nguyen Family"], "U-8807", "USED", "WON", 37200, 12],
      [cust["Hank Murphy"], "U-8811", "USED", "WON", 29100, 15],
      [cust["Omar Haddad"], "N-2404", "NEW", "PENDING_FINANCE", 35900, 6],
      [cust["Luis Ramirez"], "U-8808", "USED", "PENDING_FINANCE", 20500, 11],
      [cust["Emily & Jack Turner"], "N-2401", "NEW", "NEGOTIATING", 31800, 3],
      [cust["Fatima Al-Rashid"], "U-8809", "USED", "NEGOTIATING", 26700, 8],
      [cust["Canyon CrossFit"], "U-8806", "USED", "NEGOTIATING", 40200, 19],
      [cust["Steve Boozer"], "U-8810", "USED", "LOST", 24100, 26],
      [cust["Kenji Watanabe"], "N-2402", "NEW", "LOST", 34200, 31],
    ];
    for (const [customerId, stock, dealType, status, amount, ago] of deals) {
      await sql`
        insert into deals (organization_id, customer_id, vehicle_id, deal_type, status, amount, finance_sent_at, closed_at, created_at)
        values (${orgId}, ${customerId}, ${veh[stock]}, ${dealType}, ${status}, ${amount},
          ${status === "PENDING_FINANCE" ? daysAgo(ago - 2) : null},
          ${status === "WON" ? daysAgo(ago) : null}, ${daysAgo(ago + 2)})`;
    }

    // Service orders — includes 7 completed-but-unbilled (the flagship demo signal)
    const sos = [
      [cust["Henderson Family LLC"], "U-8801", "Brake pads + rotors, front", "COMPLETED", 842.5, 18, 15, null],
      [cust["Mrs. Dorothy Bell"], "U-8804", "Oil change + 30k service", "COMPLETED", 389.0, 16, 13, null],
      [cust["Riverside Unified School District"], "U-8805", "Fleet PM — van 07", "COMPLETED", 612.75, 14, 12, null],
      [cust["Sunrise Bakery"], "U-8813", "A/C compressor replacement", "COMPLETED", 1284.0, 12, 9, null],
      [cust["Henderson Family LLC"], "U-8812", "Alignment + tires", "COMPLETED", 1049.9, 9, 6, null],
      [cust["Vista Medical Group"], "N-2403", "Fleet PM — SUV 2", "COMPLETED", 455.25, 7, 4, null],
      [cust["Isabella Moretti"], "U-8802", "Battery + charging system", "COMPLETED", 318.4, 5, 2, null],
      [cust["Yuki Tanaka"], "U-8809", "Scheduled: 60k service", "OPEN", 0, 1, null, null],
      [cust["Riverside Pest Co"], "U-8813", "Upfit wiring — awaiting parts", "AWAITING_PARTS", 890.0, 4, null, null],
      [cust["Omar Haddad"], "N-2404", "Detail + delivery prep", "IN_PROGRESS", 249.0, 2, null, null],
    ];
    for (const [customerId, stock, title, status, amount, opened, completed, invoiced] of sos) {
      await sql`
        insert into service_orders (organization_id, customer_id, vehicle_id, title, status, amount, opened_at, completed_at, invoiced_at)
        values (${orgId}, ${customerId}, ${veh[stock]}, ${title}, ${status}, ${amount}, ${daysAgo(opened)},
          ${completed ? daysAgo(completed) : null}, ${invoiced ? daysAgo(invoiced) : null})`;
    }

    // Invoices — some paid, some overdue; NOT for the unbilled SOs above
    const invoices = [
      ["INV-1041", cust["The Nguyen Family"], "DEAL", 37200, "PAID", 12, 5],
      ["INV-1042", cust["Hank Murphy"], "DEAL", 29100, "PAID", 15, 9],
      ["INV-1043", cust["Canyon CrossFit"], "SERVICE", 640, "OVERDUE", 21, 7],
      ["INV-1044", cust["Riverside Pest Co"], "SERVICE", 1120, "SENT", 8, 22],
      ["INV-1045", cust["Kenji Watanabe"], "SERVICE", 289, "PAID", 20, 18],
    ];
    for (const [number, customerId, kind, amount, status, issued, due] of invoices) {
      await sql`
        insert into invoices (organization_id, customer_id, number, kind, amount, status, issued_at, due_at, paid_at)
        values (${orgId}, ${customerId}, ${number}, ${kind}, ${amount}, ${status}, ${daysAgo(issued)}, ${daysAgo(issued - due)}, ${status === "PAID" ? daysAgo(due - 2) : null})`;
    }

    await sql`
      insert into payments (organization_id, customer_id, invoice_id, amount, method, received_at)
      select ${orgId}, customer_id, id, amount, 'ACH', paid_at from invoices where status = 'PAID'`;

    // Leads — includes 14 stale leads (follow-up leakage signal)
    const leads = [
      ["Web form:SUV under $30k", "WEB", "Crossover, trade-in possible", 28000, "NEW", null, 21],
      ["Phone: fleet van x2", "PHONE", "Work vans, budget-conscious", 52000, "CONTACTED", 16, 15],
      ["Walk-in: first car", "WALK_IN", "College student, co-signer", 16000, "NEW", null, 13],
      ["Referral: Henderson", "REFERRAL", "Truck for landscaping biz", 41000, "CONTACTED", 9, 12],
      ["Web form:Camry hybrid", "WEB", "Wants 2026 hybrid SE", 33500, "NEW", null, 11],
      ["Facebook ad: CPO special", "MARKET", "CPO SUV, extended warranty q", 27000, "NEW", null, 10],
      ["Phone: lease end in 60d", "PHONE", "Current lease with us", 30000, "QUALIFIED", 5, 9],
      ["Web form:Tacoma SR5", "WEB", "Wants bed cover quote", 37500, "NEW", null, 8],
      ["Walk-in: credit rebuild", "WALK_IN", "Special finance candidate", 18000, "NEW", null, 7],
      ["Referral: Sunrise Bakery", "REFERRAL", "Refrigerated van!", 46000, "CONTACTED", 4, 6],
      ["Web form:Outback AWD", "WEB", "Snow trips, roof rack", 28500, "NEW", null, 5],
      ["GBP message: PDS pricing", "GBP", "Asked about diesel service", 300, "NEW", null, 4],
      ["Web form:Highlander for 7", "WEB", "Family of 7, needs 3rd row", 40500, "NEW", null, 3],
      ["Phone: trade + upgrade", "PHONE", "Has 2019 CR-V", 33000, "NEW", null, 2],
      ["Web form:Sienna hybrid", "WEB", "Comparing vs Highlander", 43000, "CONTACTED", 1, 1],
    ];
    for (const [name, source, interest, value, status, lastContact, created] of leads) {
      await sql`
        insert into leads (organization_id, name, source, interest, est_value, status, assigned_to_id, created_at, last_contact_at)
        values (${orgId}, ${name}, ${source}, ${interest}, ${value}, ${status}, ${emp["Tom Alvarez"]}, ${daysAgo(created)}, ${lastContact ? daysAgo(lastContact) : null})`;
    }

    // Communications
    await sql`
      insert into communications (organization_id, customer_id, channel, direction, summary, occurred_at) values
      (${orgId}, ${cust["The Nguyen Family"]}, 'IN_PERSON', 'INBOUND', 'Delivered Camry; family asked about Vietnamese-language owner manuals — provided.', ${daysAgo(12)}),
      (${orgId}, ${cust["Mrs. Dorothy Bell"]}, 'PHONE', 'OUTBOUND', 'Post-service CSI call — very satisfied, mentioned pickup shuttle helped.', ${daysAgo(11)}),
      (${orgId}, ${cust["Luis Ramirez"]}, 'PHONE', 'OUTBOUND', 'Stipulations list sent; awaiting pay stub + proof of address.', ${daysAgo(8)}),
      (${orgId}, ${cust["Fatima Al-Rashid"]}, 'EMAIL', 'OUTBOUND', 'Sent lease vs finance comparison; prefers Arabic-language contract review.', ${daysAgo(6)}),
      (${orgId}, ${cust["Canyon CrossFit"]}, 'EMAIL', 'INBOUND', 'Asked whether Silverado can be serviced at our lane — answered yes, set appointment.', ${daysAgo(4)})`;

    // Appointments
    await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status) values
      (${orgId}, ${cust["Isabella Moretti"]}, 'Trade-in appraisal', 'MEETING', ${daysAgo(-1)}, 'SCHEDULED'),
      (${orgId}, ${cust["Yuki Tanaka"]}, '60k service drop-off', 'SERVICE', ${daysAgo(-2)}, 'SCHEDULED'),
      (${orgId}, ${cust["Emily & Jack Turner"]}, 'Test drive — Camry SE', 'TEST_DRIVE', ${daysAgo(-1)}, 'SCHEDULED')`;

    // Documents + knowledge (dealership-specific institutional memory)
    const docRows = await sql`
      insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source) values
      (${orgId}, 'Deal Desk Discount Authority', 'deal-desk-authority.pdf', 'application/pdf', 182000, 'POLICY', 'PROCESSED', 'Sales consultants may discount up to $500. Managers up to $1,800. Anything beyond requires GM sign-off. Used units over 60 days on lot: additional $1,000 authority.', 'SEED'),
      (${orgId}, 'Service Loaner Policy', 'service-loaner-policy.pdf', 'application/pdf', 96000, 'POLICY', 'PROCESSED', 'Loaners available for repairs over 4 hours. Fleet customers get priority. Loaners must be returned washed.', 'SEED'),
      (${orgId}, 'RO-to-Invoice SOP', 'ro-invoice-sop.pdf', 'application/pdf', 74000, 'PROCEDURE', 'PROCESSED', 'Every completed repair order must be invoiced within 24 hours. Advisor submits RO summary; accounting issues invoice; exceptions require Service Manager approval.', 'SEED'),
      (${orgId}, 'Fleet PM Checklist — Vans', 'fleet-pm-vans.pdf', 'application/pdf', 88000, 'PROCEDURE', 'PROCESSED', 'Quarterly PM for fleet vans: fluids, brakes, tires, upfit wiring inspection. Document by VIN; flag any upfit electrical issues.', 'SEED')
      returning id, title`;
    const doc = Object.fromEntries(docRows.map(r => [r.title, r.id]));

    await sql`
      insert into knowledge_items (organization_id, document_id, title, content, category, tags, status) values
      (${orgId}, ${doc["Deal Desk Discount Authority"]}, 'Discount authority tiers', 'Consultants: $500. Managers: $1,800. GM beyond. Aging used stock (>60 DOL) gets +$1,000 authority.', 'POLICY', 'sales,pricing', 'FACT'),
      (${orgId}, ${doc["RO-to-Invoice SOP"]}, 'RO invoicing SLA: 24 hours', 'Completed ROs must be invoiced within 24 hours. Exceptions need Service Manager approval.', 'PROCEDURE', 'service,billing', 'FACT'),
      (${orgId}, ${doc["Service Loaner Policy"]}, 'Loaner eligibility', 'Repairs >4h qualify. Fleet priority. Return washed.', 'POLICY', 'service', 'FACT'),
      (${orgId}, NULL, 'Decision: held pricing on Sportage trim', 'We agreed in October not to discount U-8809 below $26,500 to protect margin floor.', 'DECISION', 'pricing,used', 'DECISION'),
      (${orgId}, NULL, 'Lesson: internet leads decay after 48h', 'Last quarter analysis: leads contacted within 24h closed 3x more often than those contacted after 72h.', 'LESSON', 'sales,followup', 'FACT')`;

    // Brand assets
    await sql`
      insert into brand_assets (organization_id, name, kind, description) values
      (${orgId}, 'Northgate logo pack', 'LOGO', 'Primary, mono, favicon SVGs'),
      (${orgId}, 'Brand voice & color guide', 'GUIDELINE', 'Navy + electric blue; plain-spoken voice, no exclamation marks'),
      (${orgId}, 'Service special social template', 'SOCIAL', 'Quarterly service offer, IG/FB sized')`;

    // Integrations — clearly marked DEMO vs AVAILABLE (no fabricated live connections)
    await sql`
      insert into integrations (organization_id, key, name, category, status, data_available, capabilities) values
      (${orgId}, 'dealer_dms', 'Dealer DMS (CDK / Dealertrack class)', 'DMS', 'DEMO', 'Deals, ROs, inventory, F&I menus', 'Read-only during pilot; sync mapping ready'),
      (${orgId}, 'quickbooks', 'QuickBooks Online', 'ACCOUNTING', 'DEMO', 'Invoices, payments, COA', 'Push invoices; reconcile payments'),
      (${orgId}, 'google_calendar', 'Google Calendar', 'SCHEDULING', 'DEMO', 'Appointments', 'Two-way appointment sync'),
      (${orgId}, 'google_gbp', 'Google Business Profile', 'EMAIL', 'AVAILABLE', 'Reviews, Q&A, messages', 'Review alerts; reply drafting'),
      (${orgId}, 'twilio_sms', 'Twilio SMS', 'EMAIL', 'AVAILABLE', 'Outbound SMS', 'Service status + lead follow-up texts'),
      (${orgId}, 'whatsapp_cloud', 'WhatsApp (Cloud API)', 'MESSAGING', 'AVAILABLE', 'Inbound + outbound WhatsApp', 'AI Ambassador replies from your records; status turns CONNECTED when server credentials are set')`;

    await sql`
      insert into ai_settings (organization_id) values (${orgId})`;

    // Training module from own knowledge
    const [training] = await sql`
      insert into training_modules (organization_id, title, summary, category, source, content)
      values (${orgId}, 'RO-to-Invoice in 24 Hours', 'Why fast invoicing protects cash flow and CSI.', 'PROCESS', 'AI_GENERATED',
        'Lesson built from CUE knowledge: RO-to-Invoice SOP. Covers the 24h SLA, exception path via Service Manager, and how unbilled work hides revenue. Quiz: 3 scenario questions.')
      returning id`;
    await sql`
      insert into training_assignments (training_id, employee_id, status)
      values (${training.id}, ${emp["Amy Chen"]}, 'IN_PROGRESS'), (${training.id}, ${emp["Rachel Kim"]}, 'ASSIGNED')`;

    // Innovation lab
    await sql`
      insert into ideas (organization_id, title, problem, hypothesis, proposed_solution, owner, status, next_step) values
      (${orgId}, 'Service-lane trade-in program', 'Service-only customers never meet sales.', 'Service visits convert to trade deals if appraisals happen in-lane.', 'Same-day appraisal offer at RO write-up.', 'Marcus Lee', 'EXPERIMENTING', 'Run 2-week pilot with 20 ROs.'),
      (${orgId}, 'Multilingual delivery experience', 'Growing Vietnamese & Arabic-speaking customer base.', 'Localized delivery docs lift CSI + referrals.', 'Delivery folder in EN/VI/AR; interpreter line.', 'Dana Whitfield', 'VALIDATED', 'Roll out to all F&I deliveries.')`;

    // Demo insights + rec + workflow + tasks — the flagship story:
    // Completed work, unbilled revenue.
    const [insight] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'REVENUE', '7 completed service orders never invoiced',
        ${`7 completed service orders totaling $4,951.80 have no invoice. Oldest is 15 days old, violating the 24-hour RO invoicing SOP.`},
        'HIGH', 4951.80,
        ${sql.json([
          { dedupe: "unbilled_service", label: "RO-to-Invoice SOP (24h SLA)", kind: "KNOWLEDGE", ref: "PROCEDURE" },
          { label: "7 service orders with completed_at set and invoiced_at null", kind: "QUERY", ref: "service_orders" },
        ])},
        'Cash sits on completed work; customers who are never billed will not chase the dealership to pay. The SOP sets a 24h SLA; the oldest violation is 15 days.',
        0.97)
      returning id`;

    const [rec] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight.id}, 'Bill all 7 completed service orders today',
        'Review the 7 ROs, confirm pricing, and issue invoices with same-day follow-up.',
        'Every unbilled RO is uncollected revenue and an awkward future conversation.',
        'Recovers ~$4,952 and restores the 24h SLA.', 4951.80, 0.97)
      returning id`;
    await sql`update insights set rec_id = ${rec.id} where id = ${insight.id}`;

    // Second story: stale leads
    const [insight2] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPPORTUNITY', '14 web/phone leads have had no follow-up',
        '14 leads valued at ~$460k have sat unanswered — the oldest 21 days. Internal lessons show leads contacted within 24h close 3x more.',
        'HIGH', 460300,
        ${sql.json([
          { dedupe: "stale_leads", label: "14 leads with status NEW and no last_contact_at", kind: "QUERY", ref: "leads" },
          { label: "Lesson: internet leads decay after 48h", kind: "KNOWLEDGE", ref: "LESSON" },
        ])},
        'Follow-up speed is the strongest controllable predictor of close rate in the store''s own history.',
        0.9)
      returning id`;
    const [rec2] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight2.id}, 'Launch 48-hour lead recovery sprint',
        'Assign every stale lead an owner with a 48h contact deadline and scripts.',
        'Fast follow-up is the store''s own proven close-rate multiplier.',
        '~$460k pipeline re-engaged; expect measurable close-rate lift.', 460300, 0.9)
      returning id`;
    await sql`update insights set rec_id = ${rec2.id} where id = ${insight2.id}`;

    // Third story: aging inventory
    const [insight3] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPERATIONS', '5 used units past the 60-day aging threshold',
        '5 used vehicles (incl. U-8808 at 72 days, U-8810 at 64) exceed the 60-day aging threshold from the goal sheet. Carrying cost ~$40/unit/day.',
        'MEDIUM', 66500,
        ${sql.json([
          { dedupe: "aging_inventory", label: "vehicles where listed_at older than 60 days and status AVAILABLE", kind: "QUERY", ref: "vehicles" },
          { label: "Goal: cut used days-on-lot below 45", kind: "GOAL", ref: "goals" },
        ])},
        'The discount-authority policy already grants +$1,000 pricing power past 60 days — unused so far on these units.',
        0.85)
      returning id`;
    const [rec3] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight3.id}, 'Apply aging-unit price reviews this week',
        'Use the +$1,000 aging authority to reprice 5 units; wholesale the two worst.',
        'Policy already authorizes the discount; DOL keeps accruing meanwhile.',
        'Frees ~$66.5k in stuck capital.', 66500, 0.85)
      returning id`;
    await sql`update insights set rec_id = ${rec3.id} where id = ${insight3.id}`;

    // A worked example of the full chain: approved rec → workflow → tasks
    const [wf] = await sql`
      insert into workflows (organization_id, rec_id, title, description, kind, source, status)
      values (${orgId}, ${rec.id}, 'Bill 7 completed service orders', 'Invoicing sprint from CUE insight. Owner: Rachel Kim.', 'BILLING', 'AI_RECOMMENDATION', 'ACTIVE')
      returning id`;
    await sql`update recommendations set status = 'APPROVED', decided_at = ${daysAgo(1)}, workflow_id = ${wf.id} where id = ${rec.id}`;
    await sql`update insights set status = 'ACTION_TAKEN' where id = ${insight.id}`;
    const soRows = await sql`select id, title, amount from service_orders where status='COMPLETED' and invoiced_at is null and organization_id=${orgId} limit 3`;
    for (const so of soRows) {
      await sql`
        insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin)
        values (${orgId}, ${wf.id}, ${`Invoice: ${so.title}`}, ${`Confirm pricing on RO ($${so.amount}) and issue invoice.`}, 'OPEN', 'HIGH', ${emp["Rachel Kim"]}, 'AI_RECOMMENDATION')`;
    }
    await sql`
      insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin, completed_at)
      values (${orgId}, ${wf.id}, 'Audit RO-invoice gaps in DMS export', 'Cross-check last 30 days for other misses.', 'DONE', 'MEDIUM', ${emp["Amy Chen"]}, 'WORKFLOW', ${daysAgo(1)})`;

    // Audit trail for the approved rec
    await sql`
      insert into audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, detail, created_at) values
      (${orgId}, 'AI', NULL, 'RECOMMENDATION_CREATED', 'Recommendation', ${rec.id}, 'Detected 7 unbilled completed ROs ($4,951.80).', ${daysAgo(2)}),
      (${orgId}, 'USER', ${ownerUser.id}, 'RECOMMENDATION_APPROVED', 'Recommendation', ${rec.id}, 'Dana Whitfield approved billing sprint.', ${daysAgo(1)}),
      (${orgId}, 'SYSTEM', NULL, 'WORKFLOW_CREATED', 'Workflow', ${wf.id}, 'Billing sprint with owner + tasks.', ${daysAgo(1)})`;

    await sql`commit`;

    // Fresh databases may predate the dedupe migration — guarantee the demo
    // org has at most one department per name, then verify (the unique
    // departments_org_name_key index makes this a no-op unless the DB never
    // got scripts/migrate-departments-dedupe.sql applied).
    await sql`delete from departments using (
      select id, row_number() over (partition by organization_id, name order by id) as rn
      from departments
    ) dupes where departments.id = dupes.id and dupes.rn > 1`;
    const [dupeCheck] = await sql`
      select count(*)::int as n from (
        select organization_id, name from departments group by 1, 2 having count(*) > 1
      ) d`;
    if (dupeCheck.n > 0) {
      throw new Error(`Duplicate department names remain (${dupeCheck.n}) — run scripts/migrate-departments-dedupe.sql`);
    }

    console.log("Seeded: Northgate Auto Group (auto dealership demo).");
    console.log("  customers 18 · vehicles 18 · deals 9 · service_orders 10 · leads 15 · insights 3");
  } catch (e) {
    await sql`rollback`;
    console.error("SEED FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
