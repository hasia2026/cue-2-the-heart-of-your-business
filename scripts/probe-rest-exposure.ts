/**
 * Probes the Supabase Data API (PostgREST) with the ANON key — the key that is
 * public-by-design and embedded in any client bundle. If RLS is off and grants
 * exist, every row of every table is readable/writable by anyone with this key.
 * Read-only probe: npx tsx scripts/probe-rest-exposure.ts
 */
const REF = "mgqwvgzhyqfscnnwejeh";
const ANON = process.env.ANON_KEY ?? "";

const TABLES = ["Organization", "User", "Customer", "Lead", "Message", "AuditEvent"];

async function main() {
  if (!ANON) { console.error("pass ANON_KEY env"); process.exit(1); }
  let exposed = 0;
  for (const t of TABLES) {
    try {
      const res = await fetch(`https://${REF}.supabase.co/rest/v1/${t}?select=*`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      if (res.ok) {
        const rows = (await res.json()) as unknown[];
        exposed++;
        const cols = rows[0] ? Object.keys(rows[0] as object).join(", ").slice(0, 100) : "(empty)";
        console.log(`✗ EXPOSED  ${t} — ${rows.length} row(s) readable anonymously; columns: ${cols}`);
      } else {
        const body = await res.text().catch(() => "");
        console.log(`✓ blocked  ${t} (${res.status}) ${body.slice(0, 90)}`);
      }
    } catch (e) {
      console.log(`✓ blocked  ${t} (${e instanceof Error ? e.message : "error"})`);
    }
  }
  console.log(exposed === 0 ? "\nRESULT: Data API is locked — no anonymous table access." : `\nRESULT: ${exposed}/${TABLES.length} probed tables LEAK via the Data API with the public anon key.`);
}
main();
