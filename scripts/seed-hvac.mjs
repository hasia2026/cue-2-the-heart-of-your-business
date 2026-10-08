#!/usr/bin/env node
// Seeds CUE with the HVAC industry-pack demo:
// "Summit Air Heating & Cooling" — a residential/light-commercial HVAC company
// with the same leak classes as the dealership demo, in HVAC language:
//   · completed-but-unbilled service calls (flagship)
//   · stale quote requests (leads)
//   · aging equipment quotes (repricing authority unused)
// Runs ALONGSIDE the auto demo (Northgate Auto Group) — it never touches it.
// Idempotent: wipes the Summit Air org first; users are upserted by email.
// Usage: node --env-file=.env scripts/seed-hvac.mjs
import { scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { max: 1, connect_timeout: 20 });

const DEMO_ORG = "Summit Air Heating & Cooling";
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

async function main() {
  await sql`begin`;
  try {
    await sql`delete from organizations where name = ${DEMO_ORG}`;

    const [org] = await sql`
      insert into organizations (name, is_demo) values (${DEMO_ORG}, true) returning id`;
    const orgId = org.id;

    // Demo credentials (documented in PRODUCT-TOUR.md):
    //   OWNER  demo@summitair.example  / hvac-demo-2026
    //   ADMIN  rita@summitair.example  / hvac-admin-2026
    //   MEMBER chris@summitair.example / hvac-member-2026
    const demoHash = (p) => {
      const salt = randomBytes(16).toString("hex");
      return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
    };
    const [ownerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('demo@summitair.example', 'Dana Calderon (Demo)', ${demoHash("hvac-demo-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${ownerUser.id}, 'OWNER')`;
    const [adminUser] = await sql`
      insert into users (email, name, password_hash)
      values ('rita@summitair.example', 'Rita Vasquez (Demo)', ${demoHash("hvac-admin-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${adminUser.id}, 'ADMIN')`;
    const [memberUser] = await sql`
      insert into users (email, name, password_hash)
      values ('chris@summitair.example', 'Chris Boyd (Demo)', ${demoHash("hvac-member-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${memberUser.id}, 'MEMBER')`;

    const [profile] = await sql`
      insert into business_profiles (organization_id, name, industry, size, locations, business_model, offerings, target_customers, mission, values_text, operational_priorities)
      values (${orgId}, ${DEMO_ORG}, 'HOME_SERVICES', '11-50', 'Riverside, CA — 1 shop + 6 install crews',
        'Residential replacement, repair, and commercial maintenance agreements',
        E'AC & furnace replacement\nRepair & diagnostics\nMaintenance agreements\nCommercial RTU service\nDuctwork & indoor air quality',
        'Homeowners within 30 miles; property managers; light commercial (restaurants, clinics, retail)',
        'Keep every family in the Inland Empire comfortable — and every invoice out the same day.',
        'Craftsmanship, Speed, Straight answers, Community',
        'Invoice service calls same day, convert quotes faster, grow maintenance agreements')
      returning id`;

    await sql`
      insert into goals (profile_id, title, detail, horizon) values
      (${profile.id}, 'Invoice every completed service call within 24h', 'Technician closes the call; office bills before end of day.', 'QUARTER'),
      (${profile.id}, 'Convert 40% of replacement quotes', 'Follow up on every quote within 48h; reprice aging quotes weekly.', 'YEAR'),
      (${profile.id}, 'Grow maintenance agreements to 400', 'Offer agreement at every repair visit.', 'YEAR')`;

    const deptRows = await sql`
      insert into departments (organization_id, name, description) values
      (${orgId}, 'Sales', 'Replacement quotes & comfort advisor'),
      (${orgId}, 'Install', 'Equipment change-outs'),
      (${orgId}, 'Service', 'Repair & maintenance calls'),
      (${orgId}, 'Admin', 'Office, billing, HR')
      returning id, name`;
    const dept = Object.fromEntries(deptRows.map(r => [r.name, r.id]));

    const empRows = await sql`
      insert into employees (organization_id, name, title, department_id, email, skills, responsibilities, hire_date) values
      (${orgId}, 'Dana Calderon', 'Owner / GM', ${dept.Admin}, 'dana@summitair.example', 'leadership,finance,operations', 'P&L, crews, vendor pricing', ${daysAgo(1400)}::date),
      (${orgId}, 'Rita Vasquez', 'Office Manager', ${dept.Admin}, 'rita@summitair.example', 'billing,dispatch,csi', 'Invoicing, scheduling, agreements', ${daysAgo(1000)}::date),
      (${orgId}, 'Marcus Boone', 'Comfort Advisor', ${dept.Sales}, 'marcus.b@summitair.example', 'sales,load-calcs,financing', 'Replacement quotes & financing options', ${daysAgo(500)}::date),
      (${orgId}, 'Chris Boyd', 'Lead Technician', ${dept.Service}, 'chris@summitair.example', 'diagnostics,refrigerant,electrical', 'Service calls, diagnostics bay', ${daysAgo(900)}::date),
      (${orgId}, 'Luis Ortega', 'Technician', ${dept.Service}, 'luis@summitair.example', 'repair,maintenance', 'Repair & maintenance calls', ${daysAgo(400)}::date),
      (${orgId}, 'Sam Whitaker', 'Install Lead', ${dept.Install}, 'sam@summitair.example', 'changeouts,ductwork', 'Install crews 1–3', ${daysAgo(800)}::date)
      returning id, name`;
    const emp = Object.fromEntries(empRows.map(r => [r.name, r.id]));
    await sql`update employees set manager_id = ${emp["Dana Calderon"]} where name in ('Rita Vasquez','Marcus Boone','Sam Whitaker')`;
    await sql`update employees set manager_id = ${emp["Chris Boyd"]} where name = 'Luis Ortega'`;

    // Customers
    const custNames = [
      ["The Alvarez Family", "RETAIL", "Repeat maintenance-agreement customer — 2 systems."],
      ["Sierra Vista Property Group", "FLEET", "Property manager: 14 rental units, priority dispatch."],
      ["Casa del Sol Restaurant", "WHOLESALE", "Commercial RTU — health-dept sensitive."],
      ["The Pham Family", "RETAIL", "Vietnamese-speaking household; prefers Vietnamese comms."],
      ["Mr. Earl Jenkins", "RETAIL", "Senior, fixed income — financing candidate."],
      ["Dr. Patel Family", "RETAIL", "Referred by Alvarez family."],
      ["Riverside Family Dental", "FLEET", "Clinic: air quality sensitive, 3 RTUs."],
      ["Grace & Tom Whitfield", "RETAIL", "Quote pending on 2-system change-out."],
      ["Ms. Yolanda Reyes", "RETAIL", "Arabic & Spanish speaker — straight answers wanted."],
      ["Corner Bakery #4", "WHOLESALE", "Walk-in cooler + RTU service."],
      ["Henderson Duplex", "FLEET", "Owner of 2 rental duplexes, price-sensitive."],
      ["The Okafor Family", "RETAIL", "New construction quote via builder."],
    ];
    const custRows = [];
    for (let i = 0; i < custNames.length; i++) {
      const [name, type, notes] = custNames[i];
      const rows = await sql`
        insert into customers (organization_id, name, type, notes, phone, created_at)
        values (${orgId}, ${name}, ${type}, ${notes}, ${`951-555-02${String(i).padStart(2, "0")}`}, ${daysAgo(280 - i * 12)})
        returning id, name`;
      custRows.push(rows[0]);
    }
    const cust = Object.fromEntries(custRows.map(r => [r.name, r.id]));

    // Equipment quotes (vehicles table reused: an "item" is an equipment unit
    // quoted for replacement — aging quotes are the repricing leak).
    const equipment = [
      ["Q-4401", 2025, "Trane", "XR16", "3-ton AC", "NEW", "AVAILABLE", 9840, 7100, 9],
      ["Q-4402", 2025, "Carrier", "Infinity 96", "80k BTU furnace", "NEW", "AVAILABLE", 11450, 8300, 16],
      ["Q-4403", 2025, "Lennox", "ML17XC1", "2.5-ton AC", "NEW", "AVAILABLE", 9200, 6800, 24],
      ["Q-4404", 2024, "Goodman", "GSX14", "3-ton AC", "NEW", "AVAILABLE", 7900, 5900, 31],
      ["Q-4405", 2025, "Trane", "XR17", "4-ton heat pump", "NEW", "AVAILABLE", 12800, 9600, 38],
      ["Q-4406", 2024, "Rheem", "RD17AZ", "3.5-ton heat pump", "NEW", "AVAILABLE", 10900, 8200, 47],
      ["Q-4407", 2024, "Carrier", "24SPA6", "5-ton RTU", "NEW", "AVAILABLE", 15600, 12100, 53],
      ["Q-4408", 2025, "Lennox", "SL25XPV", "5-ton heat pump", "NEW", "SOLD", 18400, 14200, null],
      ["Q-4409", 2024, "Goodman", "GMEC96", "100k BTU furnace", "NEW", "AVAILABLE", 10100, 7600, 66],
      ["Q-4410", 2024, "Trane", "XR14", "3-ton AC", "NEW", "AVAILABLE", 8900, 6600, 71],
    ];
    for (const [stock, year, make, model, trim, kind, status, price, cost, days] of equipment) {
      await sql`
        insert into vehicles (organization_id, stock_number, year, make, model, trim, kind, status, list_price, cost, listed_at, sold_at)
        values (${orgId}, ${stock}, ${year}, ${make}, ${model}, ${trim}, ${kind}, ${status}, ${price}, ${cost},
          ${days == null ? daysAgo(40) : daysAgo(days)}, ${status === "SOLD" ? daysAgo(8) : null})`;
    }

    // Deals — equipment replacement jobs
    const deals = [
      [cust["The Okafor Family"], "Q-4408", "NEW", "WON", 18400, 10],
      [cust["Grace & Tom Whitfield"], "Q-4402", "NEW", "NEGOTIATING", 11200, 5],
      [cust["Mr. Earl Jenkins"], "Q-4404", "NEW", "NEGOTIATING", 7800, 12],
      [cust["Henderson Duplex"], "Q-4406", "NEW", "PENDING_FINANCE", 10500, 8],
      [cust["Sierra Vista Property Group"], "Q-4407", "NEW", "PENDING_FINANCE", 14900, 14],
      [cust["Ms. Yolanda Reyes"], "Q-4403", "NEW", "LOST", 9100, 27],
    ];
    for (const [customerId, stock, dealType, status, amount, ago] of deals) {
      await sql`
        insert into deals (organization_id, customer_id, vehicle_id, deal_type, status, amount, finance_sent_at, closed_at, created_at)
        values (${orgId}, ${customerId}, (select id from vehicles where stock_number = ${stock} and organization_id = ${orgId}), ${dealType}, ${status}, ${amount},
          ${status === "PENDING_FINANCE" ? daysAgo(ago - 2) : null},
          ${status === "WON" ? daysAgo(ago) : null}, ${daysAgo(ago + 2)})`;
    }

    // Service calls — 6 completed but never invoiced (flagship leak)
    const sos = [
      [cust["The Alvarez Family"], "Q-4401", "AC not cooling — capacitor + recharge", "COMPLETED", 486.4, 17, 14, null],
      [cust["Casa del Sol Restaurant"], "Q-4407", "RTU compressor swap (unit 2)", "COMPLETED", 2480.0, 15, 11, null],
      [cust["Mr. Earl Jenkins"], "Q-4404", "Furnace ignition repair", "COMPLETED", 612.9, 12, 9, null],
      [cust["Sierra Vista Property Group"], "Q-4405", "Unit 7B — blower motor", "COMPLETED", 894.5, 9, 6, null],
      [cust["The Pham Family"], "Q-4403", "Duct seal + tune-up", "COMPLETED", 428.0, 7, 4, null],
      [cust["Corner Bakery #4"], "Q-4409", "Walk-in cooler — refrigerant leak", "COMPLETED", 1340.0, 5, 2, null],
      [cust["Dr. Patel Family"], "Q-4402", "Maintenance agreement tune-up", "COMPLETED", 189.0, 4, 1, null],
      [cust["Henderson Duplex"], "Q-4410", "Scheduled: spring PM", "OPEN", 0, 1, null, null],
      [cust["Riverside Family Dental"], "Q-4407", "RTU 3 — awaiting control board", "AWAITING_PARTS", 1160.0, 3, null, null],
      [cust["The Okafor Family"], "Q-4408", "Install day 2 — startup", "IN_PROGRESS", 640.0, 2, null, null],
    ];
    for (const [customerId, stock, title, status, amount, opened, completed, invoiced] of sos) {
      await sql`
        insert into service_orders (organization_id, customer_id, vehicle_id, title, status, amount, opened_at, completed_at, invoiced_at)
        values (${orgId}, ${customerId}, (select id from vehicles where stock_number = ${stock} and organization_id = ${orgId}), ${title}, ${status}, ${amount}, ${daysAgo(opened)},
          ${completed ? daysAgo(completed) : null}, ${invoiced ? daysAgo(invoiced) : null})`;
    }

    // Invoices — none for the unbilled calls above
    const invoices = [
      ["SUM-2081", cust["The Okafor Family"], "DEAL", 18400, "PAID", 9, 4],
      ["SUM-2082", cust["Corner Bakery #4"], "SERVICE", 340, "OVERDUE", 24, 8],
      ["SUM-2083", cust["Henderson Duplex"], "SERVICE", 520, "SENT", 6, 18],
      ["SUM-2084", cust["Dr. Patel Family"], "SERVICE", 189, "PAID", 21, 19],
    ];
    for (const [number, customerId, kind, amount, status, issued, due] of invoices) {
      await sql`
        insert into invoices (organization_id, customer_id, number, kind, amount, status, issued_at, due_at, paid_at)
        values (${orgId}, ${customerId}, ${number}, ${kind}, ${amount}, ${status}, ${daysAgo(issued)}, ${daysAgo(issued - due)}, ${status === "PAID" ? daysAgo(due - 2) : null})`;
    }
    await sql`
      insert into payments (organization_id, customer_id, invoice_id, amount, method, received_at)
      select ${orgId}, customer_id, id, amount, 'CARD', paid_at from invoices where status = 'PAID'`;

    // Quote requests — stale leads (follow-up leakage)
    const leads = [
      ["Web form: AC replacement 2-story", "WEB", "2000 sq ft, 2 systems", 21000, "NEW", null, 19],
      ["Phone: rattling noise — no cool", "PHONE", "Emergency-adjacent repair", 900, "NEW", null, 16],
      ["Referral: Alvarez neighbor", "REFERRAL", "Furnace swap before winter", 11200, "CONTACTED", 12, 15],
      ["Web form: heat pump quote", "WEB", "Wants efficiency comparison", 12800, "NEW", null, 12],
      ["GBP message: maintenance plan", "GBP", "2-system agreement pricing", 360, "NEW", null, 10],
      ["Phone: restaurant RTU down", "PHONE", "Health inspection next week", 2600, "CONTACTED", 8, 11],
      ["Web form: ductless mini-split", "WEB", "Garage conversion", 5400, "NEW", null, 8],
      ["Referral: Pham family", "REFERRAL", "Second opinion on quote", 9600, "NEW", null, 6],
      ["Web form: commercial PM contract", "WEB", "3 RTUs quarterly PM", 4800, "NEW", null, 5],
      ["Phone: quote follow-up", "PHONE", "Already has our quote in hand", 10900, "NEW", null, 3],
      ["Web form: financing question", "WEB", "0% APR eligibility", 14800, "NEW", null, 2],
    ];
    for (const [name, source, interest, value, status, lastContact, created] of leads) {
      await sql`
        insert into leads (organization_id, name, source, interest, est_value, status, assigned_to_id, created_at, last_contact_at)
        values (${orgId}, ${name}, ${source}, ${interest}, ${value}, ${status}, ${emp["Marcus Boone"]}, ${daysAgo(created)}, ${lastContact ? daysAgo(lastContact) : null})`;
    }

    await sql`
      insert into communications (organization_id, customer_id, channel, direction, summary, occurred_at) values
      (${orgId}, ${cust["The Alvarez Family"]}, 'PHONE', 'INBOUND', 'Very happy with same-day capacitor fix; asked about upgrading to XR17 next year.', ${daysAgo(10)}),
      (${orgId}, ${cust["Casa del Sol Restaurant"]}, 'PHONE', 'OUTBOUND', 'Compressor swapped; reminded owner invoice is coming — prefers text updates.', ${daysAgo(9)}),
      (${orgId}, ${cust["The Pham Family"]}, 'EMAIL', 'OUTBOUND', 'Sent Vietnamese-language maintenance agreement summary.', ${daysAgo(5)}),
      (${orgId}, ${cust["Ms. Yolanda Reyes"]}, 'IN_PERSON', 'INBOUND', 'Went with competitor on price; told us our quote felt padded — noted.', ${daysAgo(20)})`;

    await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status) values
      (${orgId}, ${cust["Henderson Duplex"]}, 'Spring PM visit', 'SERVICE', ${daysAgo(-2)}, 'SCHEDULED'),
      (${orgId}, ${cust["Riverside Family Dental"]}, 'RTU 3 control board swap', 'SERVICE', ${daysAgo(-3)}, 'SCHEDULED'),
      (${orgId}, ${cust["Grace & Tom Whitfield"]}, 'Quote review w/ comfort advisor', 'MEETING', ${daysAgo(-1)}, 'SCHEDULED')`;

    // Documents + knowledge
    const docRows = await sql`
      insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source) values
      (${orgId}, 'Service Call to Invoice SOP', 'call-to-invoice-sop.pdf', 'application/pdf', 84000, 'PROCEDURE', 'PROCESSED', 'Every completed service call is invoiced the same business day. Technician marks the call complete in the field app; office bills before close. Exceptions require Office Manager approval.', 'SEED'),
      (${orgId}, 'Maintenance Agreement Tiers', 'maintenance-tiers.pdf', 'application/pdf', 92000, 'POLICY', 'PROCESSED', 'Basic: annual tune-up, 10% repair discount. Plus: 2 tune-ups, priority dispatch, 15% discount. Premium: Plus + no overtime fees + 1-year parts-labor warranty on repairs. Technicians earn $25 per agreement sold.', 'SEED'),
      (${orgId}, 'Quote Repricing Authority', 'quote-repricing.pdf', 'application/pdf', 71000, 'POLICY', 'PROCESSED', 'Comfort advisor may discount up to $400. Office Manager up to $1,200. Quotes open past 30 days: additional $800 repricing authority. Beyond that: Owner sign-off.', 'SEED'),
      (${orgId}, 'Load Calculation Procedure', 'load-calc-procedure.pdf', 'application/pdf', 66000, 'PROCEDURE', 'PROCESSED', 'Every replacement quote requires a Manual J load calculation. No rule-of-thumb sizing. Document tonnage, duct condition, and insulation level on the quote.', 'SEED')
      returning id, title`;
    const doc = Object.fromEntries(docRows.map(r => [r.title, r.id]));

    await sql`
      insert into knowledge_items (organization_id, document_id, title, content, category, tags, status) values
      (${orgId}, ${doc["Service Call to Invoice SOP"]}, 'Invoicing SLA: same business day', 'Completed service calls are invoiced before end of day. Exceptions need Office Manager approval.', 'PROCEDURE', 'service,billing', 'FACT'),
      (${orgId}, ${doc["Maintenance Agreement Tiers"]}, 'Agreement tiers & tech incentive', 'Basic/Plus/Premium tiers; techs earn $25 per agreement sold. Priority dispatch is a Plus+ benefit.', 'POLICY', 'sales,agreements', 'FACT'),
      (${orgId}, ${doc["Quote Repricing Authority"]}, 'Quote discount authority', 'Advisor $400; Office Manager $1,200; quotes past 30 days get +$800; beyond that the Owner signs off.', 'POLICY', 'sales,pricing', 'FACT'),
      (${orgId}, NULL, 'Lesson: repair leads go cold in 48h', 'When a no-cool call isn''t answered within 48h, the homeowner has already called a competitor — cooling emergencies don''t wait.', 'LESSON', 'service,followup', 'FACT')`;

    await sql`
      insert into brand_assets (organization_id, name, kind, description) values
      (${orgId}, 'Summit Air logo pack', 'LOGO', 'Primary + snowflake mark SVGs'),
      (${orgId}, 'Truck wrap design', 'SOCIAL', 'Crew van wrap — brand colors + phone')`;

    await sql`
      insert into integrations (organization_id, key, name, category, status, data_available, capabilities) values
      (${orgId}, 'field_service_platform', 'Field service platform (ServiceTitan / Housecall class)', 'FIELD_SERVICE', 'DEMO', 'Jobs, quotes, agreements, technicians', 'Read-only during pilot; sync mapping ready'),
      (${orgId}, 'quickbooks', 'QuickBooks Online', 'ACCOUNTING', 'DEMO', 'Invoices, payments, COA', 'Push invoices; reconcile payments'),
      (${orgId}, 'google_calendar', 'Google Calendar', 'SCHEDULING', 'DEMO', 'Dispatch schedule', 'Two-way appointment sync'),
      (${orgId}, 'google_gbp', 'Google Business Profile', 'EMAIL', 'AVAILABLE', 'Reviews, Q&A, messages', 'Review alerts; reply drafting'),
      (${orgId}, 'twilio_sms', 'Twilio SMS', 'EMAIL', 'AVAILABLE', 'Arrival texts + quote follow-ups', 'Dispatch & follow-up texts'),
      (${orgId}, 'whatsapp_cloud', 'WhatsApp (Cloud API)', 'MESSAGING', 'AVAILABLE', 'Inbound + outbound WhatsApp', 'AI Ambassador replies from your records; status turns CONNECTED when server credentials are set')`;

    await sql`insert into ai_settings (organization_id) values (${orgId})`;

    const [training] = await sql`
      insert into training_modules (organization_id, title, summary, category, source, content)
      values (${orgId}, 'Same-Day Invoicing Habit', 'Why invoicing before close protects cash flow and agreement renewals.', 'PROCESS', 'AI_GENERATED',
        'Lesson built from CUE knowledge: Service Call to Invoice SOP. Covers the same-day rule, the exception path via the Office Manager, and how unbilled calls hide revenue and sour renewal conversations. Quiz: 3 scenario questions.')
      returning id`;
    await sql`
      insert into training_assignments (training_id, employee_id, status)
      values (${training.id}, ${emp["Luis Ortega"]}, 'IN_PROGRESS'), (${training.id}, ${emp["Chris Boyd"]}, 'ASSIGNED')`;

    // Innovation Lab — includes CUE platform deferrals parked here deliberately
    await sql`
      insert into ideas (organization_id, title, problem, hypothesis, proposed_solution, owner, status, next_step) values
      (${orgId}, 'Maintenance-agreement renewal detector', 'Agreements renew silently by invoice date; nobody tracks it.', 'Renewal outreach 30 days early lifts retention.', 'CUE detects agreement end dates and drafts renewal offers.', 'Rita Vasquez', 'PROPOSED', 'Point CUE at agreement export; measure reply rate.'),
      (${orgId}, 'CUE industry-pack terminology switcher', 'HVAC pages still show dealership-flavored labels in places.', 'Per-org vocabulary makes demos feel native.', 'Org-level label pack selected from business profile.', 'Dana Calderon', 'PROPOSED', 'Prototype with HVAC labels on pipeline & inventory pages.'),
      (${orgId}, 'Multilingual quote delivery', 'Inland Empire customers prefer quotes in Spanish/Vietnamese.', 'Localized quotes convert better.', 'Quote PDF generated in the household''s language.', 'Marcus Boone', 'EXPERIMENTING', 'Trial with 10 quotes this month.')`;

    // Insights — the three flagship stories, in HVAC language
    const [insight] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'REVENUE', '7 completed service calls never invoiced',
        ${`7 completed service calls totaling $6,430.80 have no invoice. Oldest is 14 days old, violating the same-day invoicing SOP.`},
        'HIGH', 6430.80,
        ${sql.json([
          { label: "Service Call to Invoice SOP (same-day rule)", kind: "KNOWLEDGE", ref: "PROCEDURE" },
          { label: "7 service calls with completed_at set and invoiced_at null", kind: "QUERY", ref: "service_orders" },
        ])},
        'Completed work with no invoice is money the company earned and never collected. The SOP sets a same-day rule; the oldest violation is 14 days.',
        0.97)
      returning id`;

    const [rec] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight.id}, 'Bill all 7 completed service calls today',
        'Review the 7 calls, confirm pricing, and issue invoices with same-day follow-up.',
        'Every unbilled call is uncollected revenue and an awkward renewal conversation later.',
        'Recovers ~$6,431 and restores the same-day rule.', 6430.80, 0.97)
      returning id`;
    await sql`update insights set rec_id = ${rec.id} where id = ${insight.id}`;

    const [insight2] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPPORTUNITY', '11 quote requests have had no follow-up',
        '11 leads valued at ~$99,360 have sat unanswered — the oldest 19 days. No-cool and replacement shoppers call the next company within 48h.',
        'HIGH', 99360,
        ${sql.json([
          { label: "11 leads with status NEW and no last_contact_at", kind: "QUERY", ref: "leads" },
          { label: "Lesson: repair leads go cold in 48h", kind: "KNOWLEDGE", ref: "LESSON" },
        ])},
        'In emergencies and replacement shopping alike, the first company to answer wins the job.',
        0.9)
      returning id`;
    const [rec2] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight2.id}, 'Launch 48-hour quote recovery sprint',
        'Assign every stale quote request an owner with a 48h contact deadline and scripts.',
        'Speed-to-answer is the single controllable factor in HVAC close rates.',
        '~$99k pipeline re-engaged.', 99360, 0.9)
      returning id`;
    await sql`update insights set rec_id = ${rec2.id} where id = ${insight2.id}`;

    const [insight3] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPERATIONS', '7 equipment quotes past the 30-day window',
        '7 open quotes (incl. Q-4410 at 71 days, Q-4409 at 66) exceed the 30-day repricing threshold. Homeowners re-shop quotes after ~3 weeks.',
        'MEDIUM', 75400,
        ${sql.json([
          { label: "equipment quotes older than 30 days with status AVAILABLE", kind: "QUERY", ref: "vehicles" },
          { label: "Quote Repricing Authority (+$800 past 30 days)", kind: "KNOWLEDGE", ref: "POLICY" },
        ])},
        'The repricing policy already grants +$800 past 30 days — unused so far on these quotes.',
        0.85)
      returning id`;
    const [rec3] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight3.id}, 'Reprice aging quotes this week',
        'Use the +$800 aging authority to re-follow-up 7 quotes; formally withdraw the two oldest.',
        'Policy already authorizes the discount; the homeowner re-shops meanwhile.',
        'Re-engages ~$75.4k in quoted work.', 75400, 0.85)
      returning id`;
    await sql`update insights set rec_id = ${rec3.id} where id = ${insight3.id}`;

    // Worked example: approved rec → workflow → tasks
    const [wf] = await sql`
      insert into workflows (organization_id, rec_id, title, description, kind, source, status)
      values (${orgId}, ${rec.id}, 'Bill 7 completed service calls', 'Invoicing sprint from CUE insight. Owner: Rita Vasquez.', 'BILLING', 'AI_RECOMMENDATION', 'ACTIVE')
      returning id`;
    await sql`update recommendations set status = 'APPROVED', decided_at = ${daysAgo(1)}, workflow_id = ${wf.id} where id = ${rec.id}`;
    await sql`update insights set status = 'ACTION_TAKEN' where id = ${insight.id}`;
    const soRows = await sql`select id, title, amount from service_orders where status='COMPLETED' and invoiced_at is null and organization_id=${orgId} limit 3`;
    for (const so of soRows) {
      await sql`
        insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin)
        values (${orgId}, ${wf.id}, ${`Invoice: ${so.title}`}, ${`Confirm pricing on the call ($${so.amount}) and issue invoice.`}, 'OPEN', 'HIGH', ${emp["Rita Vasquez"]}, 'AI_RECOMMENDATION')`;
    }
    await sql`
      insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin, completed_at)
      values (${orgId}, ${wf.id}, 'Audit call-invoice gaps in field app export', 'Cross-check last 30 days for other misses.', 'DONE', 'MEDIUM', ${emp["Rita Vasquez"]}, 'WORKFLOW', ${daysAgo(1)})`;

    await sql`
      insert into audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, detail, created_at) values
      (${orgId}, 'AI', NULL, 'RECOMMENDATION_CREATED', 'Recommendation', ${rec.id}, 'Detected 7 unbilled completed service calls ($6,430.80).', ${daysAgo(2)}),
      (${orgId}, 'USER', ${ownerUser.id}, 'RECOMMENDATION_APPROVED', 'Recommendation', ${rec.id}, 'Dana Calderon approved invoicing sprint.', ${daysAgo(1)}),
      (${orgId}, 'SYSTEM', NULL, 'WORKFLOW_CREATED', 'Workflow', ${wf.id}, 'Invoicing sprint with owner + tasks.', ${daysAgo(1)})`;

    await sql`commit`;
    console.log("Seeded: Summit Air Heating & Cooling (HVAC demo).");
    console.log("  customers 12 · equipment quotes 10 · deals 6 · service calls 10 · leads 11 · insights 3");
  } catch (e) {
    await sql`rollback`;
    console.error("SEED FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
