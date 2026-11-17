#!/usr/bin/env node
// Seeds CUE with the salon industry-pack demo:
// "Lotus Nail Studio" — a Vietnamese-owned nail studio in Garden Grove
// (Orange County), with the same leak classes as the other packs, in salon
// language:
//   · completed tickets never invoiced (flagship)
//   · booking enquiries (Instagram / Google / text) with no follow-up
//   · regulars overdue for a rebook
// Runs ALONGSIDE the auto + HVAC demos — it never touches them.
// Idempotent: wipes the Lotus org first; users are upserted by email.
// Usage: node --env-file=.env scripts/seed-salon.mjs
import { scryptSync, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { max: 1, connect_timeout: 20 });

const DEMO_ORG = "Lotus Nail Studio";
const daysAgo = (n) => new Date(Date.now() - n * 864e5);

async function main() {
  await sql`begin`;
  try {
    // Orphaned payments guard — same pattern as the other packs.
    await sql`delete from payments where customer_id in (
      select id from customers where organization_id in (
        select id from organizations where name = ${DEMO_ORG}))`;
    await sql`delete from organizations where name = ${DEMO_ORG}`;

    const [org] = await sql`
      insert into organizations (name, is_demo) values (${DEMO_ORG}, true) returning id`;
    const orgId = org.id;

    // Demo credentials (documented in PRODUCT-TOUR.md / README.md):
    //   OWNER   demo@lotusnails.example / lotus-demo-2026
    //   ADMIN   mai@lotusnails.example  / lotus-admin-2026
    //   MANAGER kim@lotusnails.example  / lotus-mgr-2026
    //   MEMBER  vy@lotusnails.example   / lotus-staff-2026
    const demoHash = (p) => {
      const salt = randomBytes(16).toString("hex");
      return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
    };
    const [ownerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('demo@lotusnails.example', 'Linh Nguyễn (Demo)', ${demoHash("lotus-demo-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${ownerUser.id}, 'OWNER')`;
    const [adminUser] = await sql`
      insert into users (email, name, password_hash)
      values ('mai@lotusnails.example', 'Mai Trần (Demo)', ${demoHash("lotus-admin-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${adminUser.id}, 'ADMIN')`;
    const [managerUser] = await sql`
      insert into users (email, name, password_hash)
      values ('kim@lotusnails.example', 'Kim Phạm (Demo)', ${demoHash("lotus-mgr-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${managerUser.id}, 'MANAGER')
      on conflict (organization_id, user_id) do nothing`;
    const [memberUser] = await sql`
      insert into users (email, name, password_hash)
      values ('vy@lotusnails.example', 'Vy Lê (Demo)', ${demoHash("lotus-staff-2026")})
      on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash
      returning id`;
    await sql`insert into members (organization_id, user_id, role) values (${orgId}, ${memberUser.id}, 'MEMBER')`;

    const [profile] = await sql`
      insert into business_profiles (organization_id, name, industry, size, locations, business_model, offerings, target_customers, mission, values_text, operational_priorities, timezone)
      values (${orgId}, ${DEMO_ORG}, 'SALON', '6-10', 'Garden Grove, CA — 1 studio, 8 stations, 3 pedicure chairs',
        'Appointment-first nail studio: gel, acrylic, dip, spa pedicure, waxing',
        E'Gel manicure\\nAcrylic full set\\nDip powder\\nSpa pedicure\\nNail art\\nBrow & face waxing',
        'Vietnamese-American families and Orange County regulars within 15 minutes; bridal and party groups',
        'Every client leaves with a plan for the next visit.',
        'Clean tools, honest prices, family, community',
        'Rebook before checkout, bill every ticket the same day, win back lapsed regulars',
        'America/Los_Angeles')
      returning id`;

    await sql`
      insert into goals (profile_id, title, detail, horizon) values
      (${profile.id}, 'Rebook 70% of clients before they leave', 'Front desk offers the next slot at checkout, every time.', 'QUARTER'),
      (${profile.id}, 'Zero unbilled tickets at close', 'Technician closes the ticket; front desk bills before the drawer closes.', 'QUARTER'),
      (${profile.id}, 'Win back 40 lapsed regulars', 'Text every client who has not visited in 8 weeks — in their language.', 'YEAR')`;

    const deptRows = await sql`
      insert into departments (organization_id, name, description) values
      (${orgId}, 'Front Desk', 'Check-in, rebooking, billing'),
      (${orgId}, 'Nail Technicians', 'Manicure, acrylic, dip, pedicure'),
      (${orgId}, 'Skin & Wax', 'Brows, face and body waxing'),
      (${orgId}, 'Retail', 'Product shelf and add-on sales')
      returning id, name`;
    const dept = Object.fromEntries(deptRows.map(r => [r.name, r.id]));

    const empRows = await sql`
      insert into employees (organization_id, name, title, department_id, email, skills, responsibilities, hire_date) values
      (${orgId}, 'Linh Nguyễn', 'Owner / Lead Artist', ${dept.Admin ?? dept['Front Desk']}, 'linh@lotusnails.example', 'gel,acrylic,nail-art,leadership', 'P&L, hiring, bridal consults', ${daysAgo(1600)}::date),
      (${orgId}, 'Mai Trần', 'Front Desk Lead', ${dept['Front Desk']}, 'mai@lotusnails.example', 'booking,billing,vietnamese-english', 'Check-in, rebooking, invoices', ${daysAgo(900)}::date),
      (${orgId}, 'Kim Phạm', 'Senior Nail Technician', ${dept['Nail Technicians']}, 'kim@lotusnails.example', 'gel,acrylic,dip,mentoring', 'Lead tech, quality checks', ${daysAgo(1200)}::date),
      (${orgId}, 'Vy Lê', 'Nail Technician', ${dept['Nail Technicians']}, 'vy@lotusnails.example', 'gel,dip,nail-art', 'Gel, dip, art appointments', ${daysAgo(420)}::date),
      (${orgId}, 'Thảo Võ', 'Pedicure Specialist', ${dept['Nail Technicians']}, 'thao@lotusnails.example', 'spa-pedicure,foot-care', 'Spa pedicures, foot care', ${daysAgo(700)}::date),
      (${orgId}, 'Nina Cortez', 'Wax & Skin Specialist', ${dept['Skin & Wax']}, 'nina@lotusnails.example', 'brows,waxing,english-spanish', 'Brows and waxing services', ${daysAgo(300)}::date)
      returning id, name`;
    const emp = Object.fromEntries(empRows.map(r => [r.name, r.id]));
    await sql`update employees set manager_id = ${emp["Linh Nguyễn"]} where name in ('Mai Trần','Kim Phạm','Nina Cortez')`;
    await sql`update employees set manager_id = ${emp["Kim Phạm"]} where name in ('Vy Lê','Thảo Võ')`;

    // Standing weekly roster — proves the schedule grid is vertical-neutral.
    const SHIFTS = [
      ["Linh Nguyễn", [2,'AM'],[3,'AM'],[4,'AM'],[5,'AM'],[6,'AM']],
      ["Mai Trần", [1,'AM'],[2,'AM'],[3,'AM'],[4,'AM'],[5,'AM'],[6,'AM']],
      ["Kim Phạm", [1,'DOUBLE'],[2,'DOUBLE'],[3,'DOUBLE'],[4,'DOUBLE'],[5,'DOUBLE'],[6,'AM']],
      ["Vy Lê", [1,'PM'],[2,'PM'],[3,'PM'],[4,'PM'],[5,'PM'],[6,'AM']],
      ["Thảo Võ", [2,'AM'],[3,'AM'],[4,'AM'],[5,'AM'],[6,'DOUBLE']],
      ["Nina Cortez", [3,'PM'],[4,'PM'],[5,'PM'],[6,'AM']],
    ];
    for (const [name, ...days] of SHIFTS) {
      const eid = emp[name];
      for (const [dow, shift] of days) {
        await sql`insert into employee_shifts (organization_id, employee_id, day_of_week, shift)
          values (${orgId}, ${eid}, ${dow}, ${shift})
          on conflict (employee_id, day_of_week) do update set shift = excluded.shift`;
      }
    }

    // Customers — Orange County, mostly Vietnamese-speaking regulars.
    const custNames = [
      ["Chị Lan Nguyễn", "RETAIL", "Gel regular on a 3-week cycle; prefers Vietnamese.", "12572 Brookhurst St, Garden Grove, CA 92840", "Garden Grove"],
      ["The Võ Family", "RETAIL", "Mother + two daughters, books together; Vietnamese at home.", "9411 Bolsa Ave, Westminster, CA 92683", "Westminster"],
      ["Megan Trần", "RETAIL", "Bridal party in May — trial booked, 6 bridesmaids.", "17120 Magnolia St, Fountain Valley, CA 92708", "Fountain Valley"],
      ["Alicia Ramirez", "RETAIL", "Monthly spa pedicure; prefers Spanish.", "2114 N Main St, Santa Ana, CA 92706", "Santa Ana"],
      ["Jennifer Park", "RETAIL", "Acrylic full set every 4 weeks; found us on Instagram.", "1400 S Harbor Blvd, Fullerton, CA 92832", "Fullerton"],
      ["Chị Hoa Phạm", "RETAIL", "Walk-in turned regular; prefers Vietnamese.", "8877 Trask Ave, Garden Grove, CA 92844", "Garden Grove"],
      ["Brittany Lê", "RETAIL", "Gel + nail art; high ticket, books 6 weeks out.", "19001 Beach Blvd, Huntington Beach, CA 92648", "Huntington Beach"],
      ["Carol Whitfield", "RETAIL", "Weekly pedicure, retired, always pays cash.", "5400 E Santa Ana Canyon Rd, Anaheim Hills, CA 92807", "Anaheim Hills"],
      ["Tina Nguyễn", "RETAIL", "No-showed twice; last visit 9 weeks ago.", "8100 Commonwealth Ave, Buena Park, CA 90621", "Buena Park"],
      ["Grace Đỗ", "WHOLESALE", "Bridal party of 8 — quote accepted, deposit paid.", "15151 Moran St, Westminster, CA 92683", "Westminster"],
      ["Sofia Martinez", "RETAIL", "Brows + waxing; referred by Alicia.", "2300 E Katella Ave, Anaheim, CA 92806", "Anaheim"],
      ["Kimberly Châu", "RETAIL", "Dip powder on lunch breaks; works nearby.", "17800 Von Karman Ave, Irvine, CA 92614", "Irvine"],
    ];
    const custRows = [];
    for (let i = 0; i < custNames.length; i++) {
      const [name, type, notes, address, area] = custNames[i];
      const rows = await sql`
        insert into customers (organization_id, name, type, notes, phone, address, area, created_at)
        values (${orgId}, ${name}, ${type}, ${notes}, ${`714-555-01${String(i).padStart(2, "0")}`}, ${address}, ${area}, ${daysAgo(260 - i * 14)})
        returning id, name`;
      custRows.push(rows[0]);
    }
    const cust = Object.fromEntries(custRows.map(r => [r.name, r.id]));
    await sql`update customers set preferred_locale = 'vi' where id in (${cust["Chị Lan Nguyễn"]}, ${cust["The Võ Family"]}, ${cust["Chị Hoa Phạm"]}, ${cust["Tina Nguyễn"]}, ${cust["Grace Đỗ"]})`;
    await sql`update customers set preferred_locale = 'es' where id = ${cust["Alicia Ramirez"]}`;

    // Service menu — labor rates are salon-style: standalone vs add-on price.
    await sql`
      insert into service_offerings (organization_id, name, kind, description, parts_cost, labor_rate_standalone, labor_hours, labor_rate_addon) values
      (${orgId}, 'Gel manicure', 'SERVICE', 'Shape, cuticle care, gel color (2–3 week wear)', 3, 45, 0.75, 35),
      (${orgId}, 'Acrylic full set', 'SERVICE', 'Tips + acrylic, shape and color', 8, 75, 1.25, 60),
      (${orgId}, 'Dip powder', 'SERVICE', 'Dip color over natural nail, no lamp', 6, 60, 1, 50),
      (${orgId}, 'Spa pedicure', 'SERVICE', 'Soak, scrub, callus work, massage, polish', 5, 55, 1, 45),
      (${orgId}, 'Gel pedicure', 'SERVICE', 'Spa pedicure with gel color', 6, 65, 1.25, 55),
      (${orgId}, 'Nail art (per hand)', 'SERVICE', 'Chrome, French, or hand-painted art', 1, 25, 0.5, 20),
      (${orgId}, 'Brow wax', 'SERVICE', 'Shape and cleanup', 1, 22, 0.25, 18),
      (${orgId}, 'Full-face wax', 'SERVICE', 'Brow, lip, chin', 3, 55, 0.75, 45)`;

    // Retail shelf — the vehicles table is CUE's generic "items" table. Aged
    // product past 60 days is the salon's version of aging inventory.
    const retail = [
      ["RET-1001", 2026, "OPI", "GelColor 15ml", "Bubble Bath", "NEW", "AVAILABLE", 14, 7, 18, null],
      ["RET-1002", 2026, "DND", "Dip Powder 2oz", "Porcelain", "NEW", "AVAILABLE", 18, 9, 42, null],
      ["RET-1003", 2025, "CND", "Solar Oil", ".25oz cuticle oil", "NEW", "AVAILABLE", 12, 6, 74, null],
      ["RET-1004", 2026, "Kiara Sky", "Acrylic Powder", "Clear 4oz", "NEW", "AVAILABLE", 24, 12, 33, null],
      ["RET-1005", 2025, "Footlogix", "Callus Cream", "125ml", "NEW", "AVAILABLE", 28, 14, 88, null],
      ["RET-1006", 2026, "Aprés", "Gel-X Kit", "Natural medium", "NEW", "SOLD", 45, 22, 10, 3],
    ];
    for (const [stock, year, make, model, trim, kind, status, price, cost, listed, sold] of retail) {
      await sql`
        insert into vehicles (organization_id, stock_number, year, make, model, trim, kind, status, list_price, cost, listed_at, sold_at)
        values (${orgId}, ${stock}, ${year}, ${make}, ${model}, ${trim}, ${kind}, ${status}, ${price}, ${cost}, ${daysAgo(listed)}, ${sold == null ? null : daysAgo(sold)})`;
    }

    // Tickets — 7 completed but never invoiced (flagship leak).
    const tickets = [
      [cust["Chị Lan Nguyễn"], "Gel fill + nail art", "COMPLETED", 68, 18, 15],
      [cust["Megan Trần"], "Bridal trial — dip + art", "COMPLETED", 72, 15, 12],
      [cust["Brittany Lê"], "Acrylic full set + art", "COMPLETED", 115, 12, 9],
      [cust["Carol Whitfield"], "Spa pedicure", "COMPLETED", 55, 9, 7],
      [cust["Chị Hoa Phạm"], "Gel manicure", "COMPLETED", 45, 6, 4],
      [cust["Jennifer Park"], "Acrylic full set", "COMPLETED", 85, 4, 2],
      [cust["Alicia Ramirez"], "Brow + full-face wax", "COMPLETED", 77, 3, 1],
      [cust["Grace Đỗ"], "Bridal party consult (8)", "OPEN", 120, 2, null],
      [cust["Tina Nguyễn"], "Win-back gel manicure", "OPEN", 45, 1, null],
      [cust["Kimberly Châu"], "Dip powder (lunch break)", "IN_PROGRESS", 60, 0, null],
    ];
    for (const [customerId, title, status, amount, opened, completed] of tickets) {
      await sql`
        insert into service_orders (organization_id, customer_id, title, status, amount, opened_at, completed_at)
        values (${orgId}, ${customerId}, ${title}, ${status}, ${amount}, ${daysAgo(opened)}, ${completed == null ? null : daysAgo(completed)})`;
    }

    // Invoices — none for the seven completed tickets above.
    const invoices = [
      ["LOT-1038", cust["Tina Nguyễn"], "SERVICE", 50, "PAID", 30, 15, 28],
      ["LOT-1039", cust["Sofia Martinez"], "SERVICE", 22, "OVERDUE", 26, 8, null],
      ["LOT-1040", cust["Kimberly Châu"], "SERVICE", 60, "SENT", 5, 16, null],
      ["LOT-1041", cust["Grace Đỗ"], "DEAL", 300, "PAID", 7, 0, 6],
    ];
    for (const [number, customerId, kind, amount, status, issued, dueInDays, paid] of invoices) {
      await sql`
        insert into invoices (organization_id, customer_id, number, kind, amount, status, issued_at, due_at, paid_at)
        values (${orgId}, ${customerId}, ${number}, ${kind}, ${amount}, ${status}, ${daysAgo(issued)}, ${daysAgo(issued - dueInDays)}, ${paid == null ? null : daysAgo(paid)})`;
    }
    await sql`
      insert into payments (organization_id, customer_id, invoice_id, amount, method, received_at)
      select ${orgId}, customer_id, id, amount, 'CARD', paid_at
      from invoices where status = 'PAID' and organization_id = ${orgId}`;

    // Packages / party bookings.
    const deals = [
      [cust["Grace Đỗ"], "NEW", "WON", 1200, 9, 6],
      [cust["Megan Trần"], "NEW", "NEGOTIATING", 900, 4, null],
      [cust["Carol Whitfield"], "NEW", "WON", 540, 24, 21],
    ];
    for (const [customerId, dealType, status, amount, created, closed] of deals) {
      await sql`
        insert into deals (organization_id, customer_id, deal_type, status, amount, closed_at, created_at)
        values (${orgId}, ${customerId}, ${dealType}, ${status}, ${amount}, ${closed == null ? null : daysAgo(closed)}, ${daysAgo(created)})`;
    }

    // Booking enquiries — stale follow-up (Instagram DMs, Google, texts).
    const leads = [
      ["Instagram DM: bridal party of 8", "WEB", "Asked for a May date and deposit terms", 1200, "NEW", null, 18],
      ["Google: first-time gel manicure", "GBP", "Saw the Bolsa Ave listing, wants this week", 65, "NEW", null, 15],
      ["Yelp: acrylic full set", "WEB", "Asked if we do walk-ins on Saturday", 85, "NEW", null, 13],
      ["Walk-in: mom + daughter pedicures", "PHONE", "Wants back-to-back chairs", 110, "CONTACTED", 9, 12],
      ["Instagram DM: prom nail art", "WEB", "Wants chrome + art, May 18", 95, "NEW", null, 10],
      ["Text: rebook reminder reply", "PHONE", "Replied 'next week?' — no slot offered", 45, "NEW", null, 9],
      ["Referral: Megan's sister", "REFERRAL", "Bridal party add-on, 4 people", 60, "NEW", null, 7],
      ["Google: 'do you do dip?'", "GBP", "Asked about dip vs gel durability", 60, "CONTACTED", 5, 6],
      ["Instagram DM: bridal party of 5", "WEB", "September date, wants pricing", 750, "NEW", null, 4],
      ["Walk-in: brow wax", "PHONE", "Walked in, no tech free, left number", 22, "NEW", null, 3],
      ["Text: lapsed regular Tina", "PHONE", "Win-back text sent, no reply yet", 45, "NEW", null, 2],
      ["Referral: office group (12)", "REFERRAL", "Friday team manicures, needs quote", 900, "NEW", null, 1],
    ];
    for (const [name, source, interest, value, status, lastContact, created] of leads) {
      await sql`
        insert into leads (organization_id, name, source, interest, est_value, status, assigned_to_id, created_at, last_contact_at)
        values (${orgId}, ${name}, ${source}, ${interest}, ${value}, ${status}, ${emp["Mai Trần"]}, ${daysAgo(created)}, ${lastContact ? daysAgo(lastContact) : null})`;
    }

    await sql`
      insert into communications (organization_id, customer_id, channel, direction, summary, occurred_at) values
      (${orgId}, ${cust["Chị Lan Nguyễn"]}, 'PHONE', 'INBOUND', 'Called to move her gel fill up a day; prefers Vietnamese text confirmations.', ${daysAgo(8)}),
      (${orgId}, ${cust["Grace Đỗ"]}, 'EMAIL', 'OUTBOUND', 'Sent bridal party quote for 8 — deposit link included.', ${daysAgo(6)}),
      (${orgId}, ${cust["Tina Nguyễn"]}, 'PHONE', 'OUTBOUND', 'Win-back call went to voicemail; sent a text in Vietnamese.', ${daysAgo(4)}),
      (${orgId}, ${cust["Brittany Lê"]}, 'IN_PERSON', 'INBOUND', 'Loved the chrome art; asked to be booked 6 weeks out.', ${daysAgo(9)})`;

    await sql`
      insert into appointments (organization_id, customer_id, title, kind, scheduled_for, status, notes) values
      (${orgId}, ${cust["Megan Trần"]}, 'Bridal trial — dip + art', 'SERVICE', ${daysAgo(-1)}, 'SCHEDULED', 'Bring inspiration photos'),
      (${orgId}, ${cust["Chị Lan Nguyễn"]}, 'Gel fill (3-week cycle)', 'SERVICE', ${daysAgo(-2)}, 'SCHEDULED', 'Vietnamese confirmation text'),
      (${orgId}, ${cust["Brittany Lê"]}, 'Gel + nail art', 'SERVICE', ${daysAgo(-3)}, 'SCHEDULED', 'Chrome art, 90 min'),
      (${orgId}, ${cust["Carol Whitfield"]}, 'Spa pedicure', 'SERVICE', ${daysAgo(-4)}, 'SCHEDULED', 'Cash client'),
      (${orgId}, ${cust["Grace Đỗ"]}, 'Bridal party consult (8)', 'MEETING', ${daysAgo(-5)}, 'SCHEDULED', 'Deposit already paid')`;

    // Documents + knowledge
    const docRows = await sql`
      insert into documents (organization_id, title, file_name, mime_type, size_bytes, kind, status, extracted_text, source) values
      (${orgId}, 'Sanitation & Tool Sterilization SOP', 'sanitation-sop.pdf', 'application/pdf', 84000, 'PROCEDURE', 'PROCESSED', 'Every implement is washed, disinfected, and sterilized between clients. Files and buffers are single-use. Pedicure liners are replaced after every client; tools are never stored wet.', 'SEED'),
      (${orgId}, 'Rebooking Policy', 'rebooking-policy.pdf', 'application/pdf', 71000, 'POLICY', 'PROCESSED', 'Front desk offers the next appointment before payment on every visit. Gel clients rebook at 3 weeks, acrylic at 4 weeks, pedicure at 6 weeks. A client who leaves without a rebook gets a text within 48 hours.', 'SEED'),
      (${orgId}, 'Bridal & Party Deposit Policy', 'party-deposit-policy.pdf', 'application/pdf', 66000, 'POLICY', 'PROCESSED', 'Parties of 5 or more pay a 30% deposit to hold the date. Deposit is transferable once with 7 days notice; no-shows forfeit. Quotes include art, removal, and gratuity language.', 'SEED'),
      (${orgId}, 'Retail Commission Policy', 'retail-commission.pdf', 'application/pdf', 59000, 'POLICY', 'PROCESSED', 'Technicians earn 10% commission on retail sold at the chair. Offer one product tied to the service just performed; never pressure a client into a product they did not ask about.', 'SEED')
      returning id, title`;
    const doc = Object.fromEntries(docRows.map(r => [r.title, r.id]));

    for (const [name, note] of [
      ["Vy Lê", "New: offer exactly one retail product tied to today's service."],
      ["Kim Phạm", null],
      ["Thảo Võ", null],
    ]) {
      await sql`insert into reading_assignments (organization_id, document_id, employee_id, note)
        select ${orgId}, ${doc["Retail Commission Policy"]}, id, ${note} from employees
        where organization_id = ${orgId} and name = ${name}
        on conflict do nothing`;
    }

    await sql`
      insert into knowledge_items (organization_id, document_id, title, content, category, tags, status) values
      (${orgId}, ${doc["Sanitation & Tool Sterilization SOP"]}, 'Sterilization is never optional', 'Wash, disinfect, sterilize between clients; single-use files and buffers; fresh pedicure liner every time.', 'PROCEDURE', 'sanitation,safety', 'FACT'),
      (${orgId}, ${doc["Rebooking Policy"]}, 'Rebooking cadence by service', 'Gel 3 weeks, acrylic 4 weeks, pedicure 6 weeks. Offer the next slot before payment, and text anyone who leaves without one.', 'POLICY', 'rebooking,retention', 'FACT'),
      (${orgId}, ${doc["Bridal & Party Deposit Policy"]}, 'Party deposit terms', 'Parties of 5+ pay 30% to hold the date; one transfer with 7 days notice.', 'POLICY', 'parties,bridal', 'FACT'),
      (${orgId}, NULL, 'Lesson: no rebook, gone in 8 weeks', 'A regular who leaves without a next appointment rarely comes back on their own — the 8-week gap is where regulars quietly disappear.', 'LESSON', 'rebooking,retention', 'FACT')`;

    await sql`
      insert into brand_assets (organization_id, name, kind, description) values
      (${orgId}, 'Lotus logo pack', 'LOGO', 'Lotus mark + wordmark, light and dark'),
      (${orgId}, 'Color palette', 'SOCIAL', 'Blush, jade, and warm gold for social posts')`;

    await sql`
      insert into integrations (organization_id, key, name, category, status, data_available, capabilities) values
      (${orgId}, 'booking_platform', 'Booking platform (Booksy / Vagaro class)', 'BOOKING', 'DEMO', 'Appointments, services, technicians, deposits', 'Read-only during pilot; sync mapping ready'),
      (${orgId}, 'square', 'Square', 'PAYMENTS', 'DEMO', 'Tickets, payments, retail SKUs', 'Push tickets; reconcile payments'),
      (${orgId}, 'google_calendar', 'Google Calendar', 'SCHEDULING', 'DEMO', 'Chair schedule', 'Two-way appointment sync'),
      (${orgId}, 'google_gbp', 'Google Business Profile', 'EMAIL', 'AVAILABLE', 'Reviews, Q&A, messages', 'Review alerts; reply drafting'),
      (${orgId}, 'instagram', 'Instagram DMs', 'SOCIAL', 'AVAILABLE', 'Booking DMs and enquiry threads', 'Draft replies; convert DMs to booking leads'),
      (${orgId}, 'twilio_sms', 'Twilio SMS', 'EMAIL', 'AVAILABLE', 'Rebooking and reminder texts', 'Send confirmations and win-back texts'),
      (${orgId}, 'whatsapp_cloud', 'WhatsApp (Cloud API)', 'MESSAGING', 'AVAILABLE', 'Inbound + outbound WhatsApp', 'AI Ambassador replies in Vietnamese or English')`;

    await sql`insert into ai_settings (organization_id) values (${orgId})`;
    await sql`
      insert into workspace_profiles (organization_id, brand_name, brand_accent, brand_contact_phone)
      values (${orgId}, ${DEMO_ORG}, '#C2185B', '714-555-0140')`;

    await sql`
      insert into business_library (organization_id, question, answer) values
      (${orgId}, 'What makes Lotus different from the salon down the street?', 'Clean tools, a 3-week rebook rhythm, and bilingual service — Vietnamese and English — so families can explain exactly what they want.'),
      (${orgId}, 'Who is your ideal client?', 'Orange County regulars within 15 minutes: Vietnamese-American families, working professionals on lunch breaks, and bridal parties.'),
      (${orgId}, 'What is your rebooking promise?', 'Front desk offers the next appointment before payment on every visit. No client leaves without a plan for the next one.')`;

    const [training] = await sql`
      insert into training_modules (organization_id, title, summary, category, source, content)
      values (${orgId}, 'Rebook at the Chair', 'Why the next appointment is the real sale — and the 3-week gel cycle.', 'PROCESS', 'AI_GENERATED',
        'Lesson built from CUE knowledge: Rebooking Policy. Covers offering the next slot before payment, the cadence by service (gel 3 weeks, acrylic 4, pedicure 6), and the 48-hour win-back text for anyone who leaves without a rebook. Quiz: 3 scenario questions.')
      returning id`;
    await sql`
      insert into training_assignments (training_id, employee_id, status)
      values (${training.id}, ${emp["Vy Lê"]}, 'IN_PROGRESS'), (${training.id}, ${emp["Thảo Võ"]}, 'ASSIGNED')`;

    await sql`
      insert into ideas (organization_id, title, problem, hypothesis, proposed_solution, owner, status, next_step) values
      (${orgId}, 'Bridal-party deposit automation', 'Party quotes are sent by hand and deposits are chased over text.', 'A quote + deposit link in one message closes parties faster.', 'CUE sends the party quote with a deposit link and tracks acceptance.', 'Linh Nguyễn', 'PROPOSED', 'Run it on the next three party enquiries.'),
      (${orgId}, 'Vietnamese win-back template', 'Lapsed regulars get an English reminder and do not reply.', 'A Vietnamese text in the client''s own words brings regulars back.', 'Per-language win-back template with the client''s preferred salon.', 'Mai Trần', 'EXPERIMENTING', 'A/B 20 lapsed clients this month.'),
      (${orgId}, 'Retail attach at the chair', 'The shelf sells out of what we use, but clients never hear about it.', 'One product tied to the service just done lifts the average ticket.', 'Technician offers exactly one product at checkout; track attach rate.', 'Kim Phạm', 'PROPOSED', 'Track attach rate for two weeks.')`;

    // Insights — the three flagship stories, in salon language.
    const [insight] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'REVENUE', '7 completed tickets never invoiced',
        ${`7 completed tickets totaling $517.00 have no invoice. Oldest is 15 days old, violating the same-day billing SOP.`},
        'HIGH', 517,
        ${sql.json([
          { label: "Same-day billing SOP", kind: "KNOWLEDGE", ref: "PROCEDURE" },
          { label: "7 tickets with completed_at set and invoiced_at null", kind: "QUERY", ref: "service_orders" },
        ])},
        'Completed services with no ticket are money the studio earned and never collected. The SOP sets a same-day rule; the oldest violation is 15 days.',
        0.97)
      returning id`;
    const [rec] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight.id}, 'Bill all 7 completed tickets today',
        'Review the 7 tickets, confirm pricing, and issue invoices with a same-day text follow-up.',
        'Every unbilled ticket is uncollected revenue and an awkward conversation at the next visit.',
        'Recovers ~$517 and restores the same-day rule.', 517, 0.97)
      returning id`;
    await sql`update insights set rec_id = ${rec.id} where id = ${insight.id}`;

    const [insight2] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'OPPORTUNITY', '12 booking enquiries have had no follow-up',
        '12 enquiries worth ~$3,437 have sat unanswered — the oldest 18 days. Instagram and Google enquiries book the next salon within a day.',
        'HIGH', 3437,
        ${sql.json([
          { label: "12 leads with status NEW and no last_contact_at", kind: "QUERY", ref: "leads" },
          { label: "Lesson: no rebook, gone in 8 weeks", kind: "KNOWLEDGE", ref: "LESSON" },
        ])},
        'Booking intent decays fast: the first studio to reply wins the appointment, and a stale DM never becomes a client.',
        0.9)
      returning id`;
    const [rec2] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight2.id}, 'Launch a 48-hour booking reply sprint',
        'Assign every stale enquiry an owner with a 48h reply deadline and Vietnamese/English reply templates.',
        'Speed-to-reply is the single controllable factor in booking conversion.',
        '~$3,437 in booking pipeline re-engaged.', 3437, 0.9)
      returning id`;
    await sql`update insights set rec_id = ${rec2.id} where id = ${insight2.id}`;

    const [insight3] = await sql`
      insert into insights (organization_id, type, title, summary, severity, impact_value, evidence, reasoning, confidence)
      values (${orgId}, 'CUSTOMER', '9 regulars are overdue for a rebook',
        '9 regulars have not been back in 8+ weeks, including Tina Nguyễn (9 weeks, two no-shows). A rebook text in their own language brings most of them back.',
        'MEDIUM', 1980,
        ${sql.json([
          { label: "9 regulars with no visit or appointment in 8+ weeks", kind: "QUERY", ref: "appointments" },
          { label: "Rebooking Policy (3-week gel cycle)", kind: "KNOWLEDGE", ref: "POLICY" },
        ])},
        'A regular who leaves without a next appointment usually disappears inside 8 weeks — the gap compounds silently.',
        0.82)
      returning id`;
    const [rec3] = await sql`
      insert into recommendations (organization_id, insight_id, title, action, rationale, impact, impact_value, confidence)
      values (${orgId}, ${insight3.id}, 'Send a Vietnamese win-back text to 9 lapsed regulars',
        'Text each client in their preferred language with two open slots and their usual service.',
        'The client already knows the studio; the only missing piece is a reason to come back.',
        'Up to $1,980 of regular revenue recovered.', 1980, 0.82)
      returning id`;
    await sql`update insights set rec_id = ${rec3.id} where id = ${insight3.id}`;

    const [wf] = await sql`
      insert into workflows (organization_id, rec_id, title, description, kind, source, status)
      values (${orgId}, ${rec.id}, 'Bill 7 completed tickets', 'Billing sprint from CUE insight. Owner: Mai Trần.', 'BILLING', 'AI_RECOMMENDATION', 'ACTIVE')
      returning id`;
    await sql`update recommendations set status = 'APPROVED', decided_at = ${daysAgo(1)}, workflow_id = ${wf.id} where id = ${rec.id}`;
    await sql`update insights set status = 'ACTION_TAKEN' where id = ${insight.id}`;

    const soRows = await sql`select id, title, amount from service_orders where status='COMPLETED' and invoiced_at is null and organization_id=${orgId} limit 3`;
    for (const so of soRows) {
      await sql`
        insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin)
        values (${orgId}, ${wf.id}, ${`Invoice: ${so.title}`}, ${`Confirm the ticket total ($${so.amount}) and issue the invoice today.`}, 'OPEN', 'HIGH', ${emp["Mai Trần"]}, 'AI_RECOMMENDATION')`;
    }
    await sql`
      insert into tasks (organization_id, workflow_id, title, detail, status, priority, assignee_id, origin, completed_at)
      values (${orgId}, ${wf.id}, 'Audit last month for other unbilled tickets', 'Cross-check the booking export against issued invoices.', 'DONE', 'MEDIUM', ${emp["Mai Trần"]}, 'WORKFLOW', ${daysAgo(1)})`;

    await sql`
      insert into audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, detail, created_at) values
      (${orgId}, 'AI', NULL, 'RECOMMENDATION_CREATED', 'Recommendation', ${rec.id}, 'Detected 7 unbilled completed tickets ($517.00).', ${daysAgo(2)}),
      (${orgId}, 'USER', ${ownerUser.id}, 'RECOMMENDATION_APPROVED', 'Recommendation', ${rec.id}, 'Linh Nguyễn approved the billing sprint.', ${daysAgo(1)}),
      (${orgId}, 'SYSTEM', NULL, 'WORKFLOW_CREATED', 'Workflow', ${wf.id}, 'Billing sprint with front-desk tasks.', ${daysAgo(1)})`;

    await sql`commit`;
    console.log("Seeded: Lotus Nail Studio (salon demo, Garden Grove / Orange County).");
    console.log("  customers 12 · retail 6 · tickets 10 · leads 12 · packages 3 · insights 3");
    console.log("  logins: demo@lotusnails.example / lotus-demo-2026 (OWNER)");
  } catch (e) {
    await sql`rollback`;
    console.error("SEED FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
