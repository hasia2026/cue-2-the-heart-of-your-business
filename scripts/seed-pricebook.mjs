/**
 * Seeds demo price-book offerings + one assembly per demo org, so the Price
 * Book section renders real numbers instead of empty states. Idempotent —
 * safe to re-run. Usage: node --env-file=.env scripts/seed-pricebook.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const DEALER = { email: "demo@northgate.example", book: [
  { name: "Pre-delivery inspection", parts: 25, std: 189, addon: 149, hours: 1 },
  { name: "Detail & prep", parts: 40, std: 275, addon: 225, hours: 2 },
  { name: "Battery replacement", parts: 165, std: 249, addon: 199, hours: 0.5 },
]};
const DEALER_ASM = { name: "Trade-in ready package", description: "Inspection + detail + battery — everything a trade needs to hit the front line.",
  lines: [["Pre-delivery inspection", "STANDALONE"], ["Detail & prep", "ADDON"], ["Battery replacement", "ADDON"]] };

const HVAC = { email: "demo@summitair.example", book: [
  { name: "Add a breaker", parts: 45, std: 165, addon: 125, hours: 0.5 },
  { name: "Run wire (50 ft)", parts: 60, std: 210, addon: 150, hours: 1 },
  { name: "Cut in box & install outlet", parts: 35, std: 195, addon: 145, hours: 1 },
]};
const HVAC_ASM = { name: "New circuit", description: "The HCP ask verbatim: three line items, one named bundle.",
  lines: [["Add a breaker", "STANDALONE"], ["Run wire (50 ft)", "ADDON"], ["Cut in box & install outlet", "ADDON"]] };

for (const { email, book, asm } of [{ ...DEALER, asm: DEALER_ASM }, { ...HVAC, asm: HVAC_ASM }]) {
  const [org] = await sql`
    select m.organization_id as id from members m join users u on u.id = m.user_id
    where u.email = ${email} and m.role = 'OWNER'`;
  if (!org) { console.log(`✗ org for ${email} missing`); continue; }
  for (const o of book) {
    await sql`
      insert into service_offerings (organization_id, name, parts_cost, labor_rate_standalone, labor_rate_addon, labor_hours)
      values (${org.id}, ${o.name}, ${o.parts}, ${o.std}, ${o.addon}, ${o.hours})
      on conflict (organization_id, name) do update set parts_cost = excluded.parts_cost,
        labor_rate_standalone = excluded.labor_rate_standalone, labor_rate_addon = excluded.labor_rate_addon,
        labor_hours = excluded.labor_hours`;
  }
  await sql`
    insert into service_assemblies (organization_id, name, description)
    values (${org.id}, ${asm.name}, ${asm.description})
    on conflict (organization_id, name) do nothing`;
  const [created] = await sql`
    select id from service_assemblies where organization_id = ${org.id} and name = ${asm.name}`;
  let pos = 0;
  for (const [offeringName, mode] of asm.lines) {
    const [off] = await sql`
      select id from service_offerings where organization_id = ${org.id} and name = ${offeringName}`;
    await sql`
      insert into service_assembly_items (assembly_id, offering_id, position, pricing_mode)
      values (${created.id}, ${off.id}, ${pos++}, ${mode})
      on conflict (assembly_id, offering_id) do update set position = excluded.position, pricing_mode = excluded.pricing_mode`;
  }
  console.log(`✓ ${asm.name} seeded for ${email}'s org`);
}
await sql.end();
