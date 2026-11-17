#!/usr/bin/env node
// Seeds CUE with the AUTO REPAIR industry-pack demo:
// "Harbor Auto Repair" — an independent shop in Costa Mesa (Orange County)
// with the leak classes CUE detects, in shop language:
//   · completed repair orders never invoiced
//   · service enquiries with no follow-up
//   · regulars overdue for scheduled maintenance
// Runs alongside the other demos — never touches them.
// Idempotent: wipes the Harbor org first; users are upserted by email.
// Usage: node --env-file=.env scripts/seed-auto-repair.mjs
import { scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { max: 1, connect_timeout: 20 });

const DEMO_ORG = "Harbor Auto Repair";
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

async function main() {
  await sql`begin`;
  try {
    await sql`delete from payments where customer_id in (
      select id from customers where organization_id in (
        select id from organizations where name = ${DEMO_ORG}))`;
    await sql`delete from organizations where name = ${DEMO_ORG}`;

    const [org] = await sql`insert into organizations (name, is_demo) values (${DEMO_ORG}, true) returning id`;
    const orgId = org.id;

    // Demo credentials (documented in PRODUCT-TOUR.md / README.md):
    //   OWNER   demo@harborauto.example  / harbor-demo-2026
    //   ADMIN   nina@harborauto.example  / harbor-admin-2026
    //   MANAGER ray@harborauto.example   / harbor-mgr-2026
    //   MEMBER  tomas@harborauto.example / harbor-staff-2026
    const demoHash = (p) => {
      const salt = randomBytes(16).toString("hex");
      return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
    };
    const [ownerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('demo@harborauto.example', 'Alex Rivera (Demo)', ${demoHash("harbor-demo-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${ownerUser.id}, 'OWNER')`;
    const [adminUser] = await sql`
      insert into users (email, name, password_hash)
      values ('nina@harborauto.example', 'Nina Park (Demo)', ${demoHash("harbor-admin-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${adminUser.id}, 'ADMIN')`;
    const [managerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('ray@harborauto.example', 'Ray Delgado (Demo)', ${demoHash("harbor-mgr-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${managerUser.id}, 'MANAGER')`;
    const [memberUser] = await sql`
      insert into users (email, name, password_hash)
      values ('tomas@harborauto.example', 'Tomas Lê (Demo)', ${demoHash("harbor-staff-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${memberUser.id}, 'MEMBER')`;

    const [profile] = await sql`
      insert into business_profiles (organization_id, name, industry, size, locations, business_model, offerings, target_customers, mission, values_text, operational_priorities, timezone)
      values (${orgId}, ${DEMO_ORG}, 'AUTO_REPAIR', '6-10', 'Costa Mesa, CA — 6 bays, 2 lifts, 1 alignment rack',
        'Independent repair shop: diagnostics, brakes, AC, scheduled maintenance, used-car inspections',
        E'Diagnostic scan\\nOil & filter change\\nBrake pads & rotors (per axle)\\nAC evac & recharge\\nTiming belt\\nCoolant flush\\nBattery replacement\\nWheel alignment',
        'Orange County drivers within 10 minutes — commuters, families and small fleets who keep cars past 100k miles',
        'Keep the cars people depend on on the road, with a straight answer every time.',
        'Honest diagnostics, fair prices, clean work, no surprise add-ons',
        'Bill every completed repair order same-day, answer every service enquiry, follow up declined work',
        'America/Los_Angeles')
      returning id`;

    await sql`
      insert into goals (profile_id, title, detail, horizon) values
      (${profile.id}, 'Nothing completed leaves unbilled', 'Every repair order closes with an invoice before the car is released.', 'QUARTER'),
      (${profile.id}, 'Answer every service enquiry within 2 hours', 'One owner, one deadline, a reply in the customer''s language.', 'QUARTER'),
      (${profile.id}, 'Bring back 30 declined jobs', 'Follow up every declined recommendation with a re-quote.', 'YEAR')`;

    const deptRows = await sql`
      insert into departments (organization_id, name, description) values
      (${orgId}, 'Front Desk', 'Check-in, estimates, billing'),
      (${orgId}, 'Service Bays', 'Repairs and scheduled maintenance'),
      (${orgId}, 'Diagnostics', 'Scan tools and drivability'),
      (${orgId}, 'Parts', 'Stock, ordering, returns')
      returning id, name`;
    const dept = Object.fromEntries(deptRows.map((r) => [r.name, r.id]));

    const empRows = await sql`
      insert into employees (organization_id, name, title, department_id, email, skills, responsibilities, hire_date) values
      (${orgId}, 'Alex Rivera', 'Owner / Service Advisor', ${dept['Front Desk']}, 'alex@harborauto.example', 'estimates,diagnostics,leadership', 'P&L, customer approvals, final QC', ${daysAgo(1500)}::date),
      (${orgId}, 'Nina Park', 'Service Advisor', ${dept['Front Desk']}, 'nina@harborauto.example', 'scheduling,estimates,english-spanish', 'Check-in, rebooking, invoices', ${daysAgo(500)}::date),
      (${orgId}, 'Ray Delgado', 'Shop Foreman', ${dept['Service Bays']}, 'ray@harborauto.example', 'brakes,suspension,mentoring', 'Bay assignment, QC, comebacks', ${daysAgo(1100)}::date),
      (${orgId}, 'Tomas Lê', 'Master Technician', ${dept['Diagnostics']}, 'tomas@harborauto.example', 'drivability,electrical,ac', 'Diagnostics and complex repairs', ${daysAgo(800)}::date),
      (${orgId}, 'Chris Boone', 'Technician', ${dept['Service Bays']}, 'chris@harborauto.example', 'maintenance,brakes,tires', 'Scheduled maintenance', ${daysAgo(300)}::date),
      (${orgId}, 'Ana Ruiz', 'Parts Manager', ${dept['Parts']}, 'ana@harborauto.example', 'parts,ordering,inventory', 'Parts sourcing and returns', ${daysAgo(650)}::date)
      returning id, name`;
    const emp = Object.fromEntries(empRows.map((r) => [r.name, r.id]));
    await sql`update employees set manager_id = ${emp["Alex Rivera"]} where name in ('Nina Park','Ray Delgado','Ana Ruiz')`;
    await sql`update employees set manager_id = ${emp["Ray Delgado"]} where name in ('Tomas Lê','Chris Boone')`;

    const SHIFTS = [
      ["Alex Rivera", [1,'AM'],[2,'AM'],[3,'AM'],[4,'AM'],[5,'AM'],[6,'AM']],
      ["Nina Park", [1,'AM'],[2,'AM'],[3,'AM'],[4,'AM'],[5,'AM']],
      ["Ray Delgado", [1,'DOUBLE'],[2,'DOUBLE'],[3,'DOUBLE'],[4,'DOUBLE'],[5,'DOUBLE']],
      ["Tomas Lê", [2,'AM'],[3,'AM'],[4,'AM'],[5,'AM'],[6,'AM']],
      ["Chris Boone", [1,'PM'],[2,'PM'],[3,'PM'],[4,'PM'],[5,'PM']],
      ["Ana Ruiz", [1,'AM'],[3,'AM'],[5,'AM']],
    ];
    for (const [name, ...days] of SHIFTS) {
      for (const [dow, shift] of days) {
        await sql`insert into employee_shifts (organization_id, employee_id, day_of_week, shift)
          values (${orgId}, ${emp[name]}, ${dow}, ${shift})
          on conflict (employee_id, day_of_week) do update set shift = excluded.shift`;
      }
    }

    const custNames = [
      ["Maria Hernandez", "2016 Honda Accord", "Grinding front brakes; regular since 2019.", "1120 Baker St, Costa Mesa, CA 92626", "Costa Mesa", "es"],
      ["Derek Nguyen", "2018 Toyota Camry", "Fleet of two; wants text updates.", "8841 Bolsa Ave, Westminster, CA 92683", "Westminster", "vi"],
      ["Priya Shah", "2020 Subaru Outback", "AC not cold; extended warranty.", "2210 E Chapman Ave, Fullerton, CA 92831", "Fullerton", "en"],
      ["Mike O'Connell", "2014 Ford F-150", "Tows a boat; maintenance every 5k.", "1515 Newport Blvd, Costa Mesa, CA 92627", "Costa Mesa", "en"],
      ["Linh Pham", "2019 Honda CR-V", "Check-engine light after fueling.", "9550 Bolsa Ave, Westminster, CA 92683", "Westminster", "vi"],
      ["Carlos Mendoza", "2017 Chevrolet Silverado", "Work truck; needs it back same day.", "402 W 4th St, Santa Ana, CA 92701", "Santa Ana", "es"],
      ["Jenny Kim", "2021 Hyundai Tucson", "Dealer quoted $1,200 for brakes.", "2300 Harbor Blvd, Costa Mesa, CA 92626", "Costa Mesa", "en"],
      ["Robert Ellis", "2015 BMW 328i", "Oil leak; wants a second opinion.", "1801 E Katella Ave, Anaheim, CA 92805", "Anaheim", "en"],
      ["Thảo Võ", "2020 Mazda CX-5", "Scheduled maintenance; prefers Vietnamese text.", "7421 Trask Ave, Garden Grove, CA 92844", "Garden Grove", "vi"],
      ["Amanda Brooks", "2018 Jeep Wrangler", "Steering wobble at 60 mph.", "1700 Adams Ave, Costa Mesa, CA 92626", "Costa Mesa", "en"],
      ["Hector Ramirez", "2013 Nissan Altima", "Fleet account — 3 cars, monthly service.", "3100 W Warner Ave, Santa Ana, CA 92704", "Santa Ana", "es"],
      ["Grace Liu", "2022 Tesla Model 3", "Tire rotation and cabin filter.", "5000 Campus Dr, Irvine, CA 92612", "Irvine", "en"],
    ];
    for (let i = 0; i < custNames.length; i++) {
      const [name, , notes, address, area, locale] = custNames[i];
      const [row] = await sql`
        insert into customers (organization_id, name, type, notes, phone, address, area, preferred_locale, created_at)
        values (${orgId}, ${name}, 'RETAIL', ${`${notes}`}, ${`714-555-02${String(i).padStart(2, "0")}`}, ${address}, ${area}, ${locale}, ${daysAgo(300 - i * 16)})
        returning id`;
      custNames[i] = [name, row.id];
    }
    const cust = Object.fromEntries(custNames.map(([name, id]) => [name, id]));
    const custOf = (name) => cust[name];

    // Parts shelf — the vehicles table is CUE's generic item table (the salon
    // pack keeps its retail shelf there). Parts put the SKU in stock_number,
    // the brand in make, the part name in model, and fitment in trim.
    const parts = [
      ["BOS-2210", "Bosch", "QuietCast brake pads (front)", "2013–2017 Accord", 82, 42, 95],
      ["ACD-1145", "ACDelco", "Gold brake rotors (pair)", "2014–2019 Silverado", 108, 58, 70],
      ["NGK-4477", "NGK", "Iridium spark plugs (set of 4)", "2.4L / 2.5L engines", 58, 26, 40],
      ["MOB-8801", "Mobil 1", "Synthetic 5W-30 (6 qt)", "API SP", 62, 32, 25],
      ["DEN-3311", "Denso", "AC compressor", "2017–2021 CR-V", 410, 210, 85],
      ["FRA-9022", "Fram", "Cabin air filter", "2018–2022 Camry", 28, 12, 15],
      ["VAL-6630", "Valvoline", "Coolant 50/50 (gallon)", "Asian vehicles", 19, 9, 55],
      ["BOS-7760", "Bosch", "Alternator 150A", "2014–2018 F-150", 320, 165, 8],
    ];
    for (const [sku, brand, name, fitment, price, cost, listed] of parts) {
      await sql`
        insert into vehicles (organization_id, stock_number, year, make, model, trim, kind, status, list_price, cost, listed_at)
        values (${orgId}, ${sku}, 2026, ${brand}, ${name}, ${fitment}, 'NEW', 'AVAILABLE', ${price}, ${cost}, ${daysAgo(listed)})`;
    }

    // Labor menu — independent-shop pricing: parts at cost, labor hours at rate.
    await sql`
      insert into service_offerings (organization_id, name, kind, description, parts_cost, labor_rate_standalone, labor_hours, labor_rate_addon) values
      (${orgId}, 'Diagnostic scan', 'SERVICE', 'Full scan, road test and written findings', 0, 145, 1, 95),
      (${orgId}, 'Oil & filter change', 'SERVICE', 'Conventional or synthetic, up to 5 qt', 38, 45, 0.5, 35),
      (${orgId}, 'Brake pads & rotors (per axle)', 'SERVICE', 'Pads, rotors, hardware, fluid check', 210, 180, 2, 150),
      (${orgId}, 'AC evac & recharge', 'SERVICE', 'Leak check, evac, recharge with dye', 65, 120, 1.5, 95),
      (${orgId}, 'Timing belt', 'SERVICE', 'Belt, tensioner, water pump when needed', 280, 420, 4, 350),
      (${orgId}, 'Coolant flush', 'SERVICE', 'Drain, flush, refill, pressure test', 42, 85, 1, 70),
      (${orgId}, 'Battery replacement', 'SERVICE', 'Test, replace, register if required', 145, 35, 0.5, 25),
      (${orgId}, 'Wheel alignment', 'SERVICE', 'Four-wheel alignment with printout', 0, 120, 1, 95)`;

    // Repair orders — 7 completed and never invoiced (the flagship leak).
    const tickets = [
      [custOf("Maria Hernandez"), "Front brake pads + rotors", "COMPLETED", 842, 16, 14],
      [custOf("Derek Nguyen"), "AC evac & recharge + dye test", "COMPLETED", 486, 13, 11],
      [custOf("Priya Shah"), "Timing belt + water pump", "COMPLETED", 1240, 10, 8],
      [custOf("Mike O'Connell"), "Diagnostic + coil pack", "COMPLETED", 318, 8, 6],
      [custOf("Linh Pham"), "Evap purge valve + smoke test", "COMPLETED", 695, 6, 4],
      [custOf("Jenny Kim"), "Rear brake service", "COMPLETED", 214, 4, 2],
      [custOf("Carlos Mendoza"), "Coolant flush + thermostat", "COMPLETED", 372, 3, 1],
      [custOf("Hector Ramirez"), "Fleet: 3-car scheduled service", "OPEN", 1850, 2, null],
      [custOf("Amanda Brooks"), "Steering wobble diagnosis", "IN_PROGRESS", 320, 1, null],
      [custOf("Grace Liu"), "Tire rotation + cabin filter", "OPEN", 145, 0, null],
    ];
    for (const [customerId, title, status, amount, opened, completed] of tickets) {
      await sql`
        insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, completed_at)
        values (${orgId}, ${customerId}, ${title}, ${status}, ${amount}, ${daysAgo(opened)}, ${completed == null ? null : daysAgo(completed)})`;
    }

    await sql`
      insert into invoices (organization_id, customer_id, number, kind, amount, status, issued_at, due_at, paid_at) values
      (${orgId}, ${custOf("Thảo Võ")}, 'RO-1038', 'SERVICE', 320, 'PAID', ${daysAgo(28)}, ${daysAgo(13)}, ${daysAgo(26)}),
      (${orgId}, ${custOf("Robert Ellis")}, 'RO-1039', 'SERVICE', 145, 'OVERDUE', ${daysAgo(26)}, ${daysAgo(8)}, null),
      (${orgId}, ${custOf("Grace Liu")}, 'RO-1040', 'SERVICE', 880, 'PAID', ${daysAgo(20)}, ${daysAgo(5)}, ${daysAgo(19)}),
      (${orgId}, ${custOf("Amanda Brooks")}, 'RO-1041', 'SERVICE', 220, 'SENT', ${daysAgo(4)}, ${daysAgo(-11)}, null)`;
    await sql`
      insert into payments (organization_id, customer_id, invoice_id, amount, method, received_at)
      select ${orgId}, customer_id, id, amount, 'CARD', paid_at
      from invoices where status = 'PAID' and organization_id = ${orgId}`;

    await sql`
      insert into deals (organization_id, customer_id, deal_type, status, amount, closed_at, created_at) values
      (${orgId}, ${custOf("Derek Nguyen")}, 'NEW', 'WON', 1850, ${daysAgo(2)}, ${daysAgo(5)}),
      (${orgId}, ${custOf("Priya Shah")}, 'NEW', 'NEGOTIATING', 640, null, ${daysAgo(3)}),
      (${orgId}, ${custOf("Amanda Brooks")}, 'NEW', 'WON', 980, ${daysAgo(9)}, ${daysAgo(12)})`;

    const leads = [
      ["Text: brakes grinding, 2015 Camry", "PHONE", "Wants a same-day estimate", 640, "NEW", null, 16],
      ["Google: AC not cold", "GBP", "Asked about a recharge price", 320, "NEW", null, 14],
      ["Check-engine light after fueling", "WEB", "Form submission, no reply yet", 145, "NEW", null, 12],
      ["Fleet: 3 trucks, monthly service", "REFERRAL", "Hector referred his brother's landscaping fleet", 480, "CONTACTED", 8, 11],
      ["Dealer quoted $1,200 for brakes", "WEB", "Wants a second opinion", 220, "NEW", null, 9],
      ["Pre-purchase inspection", "PHONE", "2017 Civic, needs it before Friday", 90, "NEW", null, 8],
      ["Timing belt + water pump", "GBP", "2008 Accord, 140k miles", 380, "NEW", null, 7],
      ["Steering wobble at highway speed", "WEB", "Form submission, no reply yet", 260, "NEW", null, 5],
      ["Oil change + tire rotation", "PHONE", "Walk-in asked, no tech free", 75, "NEW", null, 3],
      ["AC leak on 2019 CR-V", "REFERRAL", "Referred by Linh Pham", 120, "NEW", null, 1],
    ];
    for (const [name, source, interest, value, status, lastContact, created] of leads) {
      await sql`
        insert into leads (organization_id, name, source, interest, est_value, status, assigned_to_id, created_at, last_contact_at)
        values (${orgId}, ${name}, ${source}, ${interest}, ${value}, ${status}, ${emp["Nina Park"]}, ${daysAgo(created)}, ${lastContact ? daysAgo(lastContact) : null})`;
    }

    await sql`
      insert into communications (organization_id, customer_id, channel, direction, summary, occurred_at) values
      (${orgId}, ${custOf("Maria Hernandez")}, 'PHONE', 'INBOUND', 'Brake pedal pulsates; booked Thursday drop-off. Prefers Spanish confirmation.', ${daysAgo(7)}),
      (${orgId}, ${custOf("Derek Nguyen")}, 'SMS', 'OUTBOUND', 'Sent estimate for AC evac and dye test; awaiting approval.', ${daysAgo(5)}),
      (${orgId}, ${custOf("Hector Ramirez")}, 'PHONE', 'INBOUND', 'Fleet service for three trucks — wants one monthly invoice.', ${daysAgo(4)}),
      (${orgId}, ${custOf("Thảo Võ")}, 'IN_PERSON', 'INBOUND', 'Oil change done; asked for a reminder at 5,000 miles.', ${daysAgo(3)})`;

    await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status, notes) values
      (${orgId}, ${custOf("Maria Hernandez")}, 'Drop-off — front brakes', 'SERVICE', ${daysAgo(-1)}, 'SCHEDULED', 'Spanish confirmation'),
      (${orgId}, ${custOf("Priya Shah")}, 'Drop-off — AC diagnosis', 'SERVICE', ${daysAgo(-2)}, 'SCHEDULED', 'Warranty claim'),
      (${orgId}, ${custOf("Hector Ramirez")}, 'Fleet service — 3 trucks', 'SERVICE', ${daysAgo(-3)}, 'SCHEDULED', 'One invoice'),
      (${orgId}, ${custOf("Amanda Brooks")}, 'Road test — steering wobble', 'SERVICE', ${daysAgo(-4)}, 'SCHEDULED', 'Needs 60 mph loop'),
      (${orgId}, ${custOf("Grace Liu")}, 'Tire rotation + cabin filter', 'SERVICE', ${daysAgo(-5)}, 'SCHEDULED', 'Wait appointment')`;

    const docRows = await sql`
      insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source) values
      (${orgId}, 'Repair Order & Billing SOP', 'ro-billing-sop.pdf', 'application/pdf', 82000, 'PROCEDURE', 'PROCESSED', 'Every completed repair order gets an invoice before the vehicle is released. Parts and labor are confirmed by the technician, the advisor reviews the total with the customer, and the invoice is issued same-day.', 'SEED'),
      (${orgId}, 'Declined Service Follow-Up Policy', 'declined-service-policy.pdf', 'application/pdf', 68000, 'POLICY', 'PROCESSED', 'Every declined recommendation is logged with a reason. The advisor follows up within 7 days with a re-quote and a reminder that the finding is still on file.', 'SEED'),
      (${orgId}, 'Parts Return & Core Policy', 'parts-return-policy.pdf', 'application/pdf', 59000, 'POLICY', 'PROCESSED', 'Special-order parts are returnable within 30 days with the original packaging. Cores are returned weekly; credits are applied to the next statement.', 'SEED'),
      (${orgId}, 'Diagnostic Workflow', 'diagnostic-workflow.pdf', 'application/pdf', 74000, 'PROCEDURE', 'PROCESSED', 'Scan first, verify the complaint with a road test, and record freeze-frame data before parts are ordered. Findings are written so the customer can understand them without jargon.', 'SEED')
      returning id, title`;
    const doc = Object.fromEntries(docRows.map((r) => [r.title, r.id]));

    for (const [name, note] of [["Chris Boone", "New: confirm the complaint with a road test before ordering parts."], ["Tomas Lê", null]]) {
      await sql`insert into reading_assignments (organization_id, document_id, employee_id, note)
        select ${orgId}, ${doc["Diagnostic Workflow"]}, id, ${note} from employees
        where organization_id = ${orgId} and name = ${name}
        on conflict do nothing`;
    }

    await sql`
      insert into knowledge_items (organization_id, document_id, title, content, category, tags, status) values
      (${orgId}, ${doc["Repair Order & Billing SOP"]}, 'Bill before the car leaves', 'Completed repair orders are invoiced before release; the advisor confirms parts and labor with the customer first.', 'PROCEDURE', 'billing,repair-orders', 'FACT'),
      (${orgId}, ${doc["Declined Service Follow-Up Policy"]}, 'Declined work gets a 7-day follow-up', 'Log every declined recommendation with a reason, then re-quote within 7 days.', 'POLICY', 'declined,retention', 'FACT'),
      (${orgId}, ${doc["Diagnostic Workflow"]}, 'Diagnose before ordering', 'Scan, road test, record freeze-frame data, then order parts.', 'PROCEDURE', 'diagnostics', 'FACT'),
      (${orgId}, NULL, 'Lesson: the second opinion is the sale', 'A customer who got a dealer quote is already shopping — a clear written estimate wins more than a discount does.', 'LESSON', 'estimates,trust', 'FACT')`;

    await sql`
      insert into brand_assets (organization_id, name, kind, description) values
      (${orgId}, 'Harbor logo pack', 'LOGO', 'Shield mark + wordmark, light and dark'),
      (${orgId}, 'Service reminder template', 'TEMPLATE', 'SMS/email maintenance reminder in English, Spanish and Vietnamese')`;

    await sql`
      insert into integrations (organization_id, key, name, category, status, data_available, capabilities) values
      (${orgId}, 'shop_management', 'Shop management (Tekmetric / Shopmonkey class)', 'SCHEDULING', 'DEMO', 'Repair orders, estimates, customers, vehicles', 'Read-only during pilot; sync mapping ready'),
      (${orgId}, 'quickbooks', 'QuickBooks', 'ACCOUNTING', 'AVAILABLE', 'Invoices, payments, parts bills', 'Push invoices; reconcile payments'),
      (${orgId}, 'google_gbp', 'Google Business Profile', 'EMAIL', 'AVAILABLE', 'Reviews, Q&A, messages', 'Review alerts; reply drafting'),
      (${orgId}, 'twilio_sms', 'Twilio SMS', 'EMAIL', 'AVAILABLE', 'Service reminders and approvals', 'Send estimates and follow-ups'),
      (${orgId}, 'carfax', 'CARFAX Service Shop', 'CRM', 'AVAILABLE', 'Service history by VIN', 'Attach history to repair orders')`;

    await sql`insert into ai_settings (organization_id) values (${orgId})`;
    await sql`insert into workspace_profiles (organization_id, brand_name, brand_accent, brand_contact_phone)
      values (${orgId}, ${DEMO_ORG}, '#0F766E', '714-555-0280')`;

    await sql`
      insert into business_library (organization_id, question, answer) values
      (${orgId}, 'What makes Harbor different from the dealer?', 'We diagnose before we quote, explain the finding in plain language, and never sell a repair the car does not need.'),
      (${orgId}, 'Who is your ideal customer?', 'Orange County drivers within 10 minutes who keep cars past 100k miles — commuters, families and small fleets.'),
      (${orgId}, 'What is your promise on estimates?', 'A written estimate before work starts, a call if the scope changes, and the old parts available to inspect.')`;

    const [training] = await sql`
      insert into training_modules (organization_id, title, summary, category, source, content)
      values (${orgId}, 'Sell the Diagnosis, Not the Parts', 'How to present a repair order so the customer approves the work — and comes back.', 'PROCESS', 'AI_GENERATED',
        'Lesson built from CUE knowledge: Diagnostic Workflow and Declined Service Follow-Up Policy. Covers the road test, presenting findings in plain language, the 7-day follow-up on declined work, and why a second opinion is a buying signal. Quiz: 3 scenario questions.')
      returning id`;
    await sql`
      insert into training_assignments (training_id, employee_id, status)
      values (${training.id}, ${emp["Chris Boone"]}, 'ASSIGNED'), (${training.id}, ${emp["Nina Park"]}, 'IN_PROGRESS')`;

    await sql`
      insert into ideas (organization_id, title, problem, hypothesis, proposed_solution, owner, status, next_step) values
      (${orgId}, 'Declined-work re-quote campaign', 'Declined jobs are logged but never revisited.', 'A 7-day re-quote recovers a third of declined work.', 'CUE drafts a re-quote in the customer''s language and assigns the follow-up.', 'Nina Park', 'PROPOSED', 'Run it on last month''s declined jobs.'),
      (${orgId}, 'Fleet maintenance agreements', 'Fleet customers book reactively and cancel when busy.', 'A monthly visit holds the account and smooths the bays.', 'Recurring fleet visit with one invoice.', 'Alex Rivera', 'EXPERIMENTING', 'Offer it to the three fleet accounts.')`;

    const [insight] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'REVENUE', '7 completed repair orders were never invoiced',
        ${`7 completed repair orders totaling $4,167.00 have no invoice. Oldest is 14 days old, against the same-day billing SOP.`},
        'HIGH', 4167,
        ${sql.json([
          { label: "Repair Order & Billing SOP", kind: "KNOWLEDGE", ref: "PROCEDURE" },
          { label: "7 repair orders with completed_at set and invoiced_at null", kind: "QUERY", ref: "service_orders" },
        ])},
        'Work left the bay and the customer drove away without an invoice — the shop did the labor and never collected.',
        0.97)
      returning id`;
    const [rec] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight.id}, 'Bill all 7 completed repair orders today',
        'Confirm parts and labor on each order, issue the invoice, and text the customer a payment link.',
        'Every unbilled repair order is money the bays already earned.',
        'Recovers ~$4,167 and restores the same-day billing rule.', 4167, 0.97)
      returning id`;
    await sql`update insights set rec_id = ${rec.id} where id = ${insight.id}`;

    const [insight2] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPPORTUNITY', '10 service enquiries have had no follow-up',
        '10 enquiries worth ~$2,730 are sitting unanswered — the oldest 16 days. Drivers book the first shop that replies.',
        'HIGH', 2730,
        ${sql.json([
          { label: "10 leads with status NEW and no last_contact_at", kind: "QUERY", ref: "leads" },
          { label: "Lesson: the second opinion is the sale", kind: "KNOWLEDGE", ref: "LESSON" },
        ])},
        'A driver with a grinding brake does not wait two weeks — they call the next shop on the list.',
        0.9)
      returning id`;
    const [rec2] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight2.id}, 'Run a 48-hour service-enquiry reply sprint',
        'Assign every stale enquiry an owner with a two-hour reply target and a written estimate template.',
        'Speed to reply is the one thing the shop fully controls.',
        '~$2,730 of service demand re-engaged.', 2730, 0.9)
      returning id`;
    await sql`update insights set rec_id = ${rec2.id} where id = ${insight2.id}`;

    const [insight3] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'CUSTOMER', '6 regulars are overdue for scheduled maintenance',
        '6 regulars have not been in for 8+ weeks, including two fleet accounts. A reminder in their language usually brings them back.',
        'MEDIUM', 1120,
        ${sql.json([
          { label: "6 regulars with no visit or appointment in 8+ weeks", kind: "QUERY", ref: "appointments" },
          { label: "Repair Order & Billing SOP", kind: "KNOWLEDGE", ref: "POLICY" },
        ])},
        'Maintenance customers drift quietly; a timely reminder is cheaper than winning a new driver.',
        0.82)
      returning id`;
    const [rec3] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight3.id}, 'Send maintenance reminders to 6 overdue regulars',
        'Text each customer in their preferred language with two open bay times and their last service.',
        'The relationship already exists; the only missing piece is a date.',
        'Up to $1,120 of scheduled maintenance recovered.', 1120, 0.82)
      returning id`;
    await sql`update insights set rec_id = ${rec3.id} where id = ${insight3.id}`;

    const [wf] = await sql`
      insert into workflows (organization_id, rec_id, title, description, kind, source, status)
      values (${orgId}, ${rec.id}, 'Bill 7 completed repair orders', 'Billing sprint from CUE insight. Owner: Nina Park.', 'BILLING', 'AI_RECOMMENDATION', 'ACTIVE')
      returning id`;
    await sql`update recommendations set status = 'APPROVED', decided_at = ${daysAgo(1)}, workflow_id = ${wf.id} where id = ${rec.id}`;
    await sql`update insights set status = 'ACTION_TAKEN' where id = ${insight.id}`;

    const soRows = await sql`select id, title, amount from service_orders where status = 'COMPLETED' and invoiced_at is null and organization_id = ${orgId} limit 3`;
    for (const so of soRows) {
      await sql`
        insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin)
        values (${orgId}, ${wf.id}, ${`Invoice: ${so.title}`}, ${`Confirm parts and labor ($${so.amount}) and issue the invoice today.`}, 'OPEN', 'HIGH', ${emp["Nina Park"]}, 'AI_RECOMMENDATION')`;
    }
    await sql`
      insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin, completed_at)
      values (${orgId}, ${wf.id}, 'Audit last month for other unbilled orders', 'Cross-check the shop-management export against issued invoices.', 'DONE', 'MEDIUM', ${emp["Nina Park"]}, 'WORKFLOW', ${daysAgo(1)})`;

    await sql`
      insert into audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, detail, created_at) values
      (${orgId}, 'AI', NULL, 'RECOMMENDATION_CREATED', 'Recommendation', ${rec.id}, 'Detected 7 unbilled completed repair orders ($4,167.00).', ${daysAgo(2)}),
      (${orgId}, 'USER', ${ownerUser.id}, 'RECOMMENDATION_APPROVED', 'Recommendation', ${rec.id}, 'Alex Rivera approved the billing sprint.', ${daysAgo(1)}),
      (${orgId}, 'SYSTEM', NULL, 'WORKFLOW_CREATED', 'Workflow', ${wf.id}, 'Billing sprint with advisor tasks.', ${daysAgo(1)})`;

    await sql`commit`;
    console.log("Seeded: Harbor Auto Repair (independent shop, Costa Mesa / Orange County).");
    console.log("  customers 12 · repair orders 10 · leads 10 · invoices 4 · insights 3");
    console.log("  logins: demo@harborauto.example / harbor-demo-2026 (OWNER)");
  } catch (e) {
    await sql`rollback`;
    console.error("SEED FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
