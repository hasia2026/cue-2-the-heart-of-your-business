// Rotates demo-account passwords in the live database to match the updated
// seed scripts. Only touches the four demo orgs' seeded emails — no real users.
// Usage: set -a; source .env; set +a; node scripts/rotate-demo-passwords.mjs
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const DEMO_ACCOUNTS = {
  // Northgate Auto Group (dealership)
  "demo@northgate.example": "northgate-demo-2026",
  "marcus@northgate.example": "northgate-demo-2026",
  "rachel@northgate.example": "northgate-mgr-2026",
  "tom@northgate.example": "northgate-staff-2026",
  // Summit Air Heating & Cooling (HVAC)
  "demo@summitair.example": "summit-demo-2026",
  "rita@summitair.example": "summit-admin-2026",
  "sam@summitair.example": "summit-mgr-2026",
  "chris@summitair.example": "summit-staff-2026",
  // Lotus Nail Studio (salon)
  "demo@lotusnails.example": "lotus-demo-2026",
  "mai@lotusnails.example": "lotus-admin-2026",
  "kim@lotusnails.example": "lotus-mgr-2026",
  "vy@lotusnails.example": "lotus-staff-2026",
  // Harbor Auto Repair (independent shop)
  "demo@harborauto.example": "harbor-demo-2026",
  "nina@harborauto.example": "harbor-admin-2026",
  "ray@harborauto.example": "harbor-mgr-2026",
  "tomas@harborauto.example": "harbor-staff-2026",
};
const DEMO_EMAILS = new Set(Object.keys(DEMO_ACCOUNTS));

function hashPassword(p) {
  const salt = randomBytes(16).toString("hex");
  return `s1:${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  for (const [email, password] of Object.entries(DEMO_ACCOUNTS)) {
    const rows = await sql`
      update users set password_hash = ${hashPassword(password)}, password_changed_at = now()
      where email = ${email}
      returning email`;
    console.log(rows.length ? `✔ ${email} → new password` : `• ${email} not present (skipped)`);
  }
  // Guardrail: only accounts in DEMO_ACCOUNTS may have changed. Deriving the
  // allowed set from the map (instead of a hand-written domain list) keeps this
  // honest when an org is added, and fails loudly if a real user is touched.
  const recent = await sql`
    select email from users
    where password_changed_at > now() - interval '5 seconds'`;
  const unexpected = recent.map((row) => row.email).filter((email) => !DEMO_EMAILS.has(email));
  console.log(`non-demo users modified in the last 5s: ${unexpected.length}`);
  if (unexpected.length) {
    console.error(`✖ unexpected accounts changed: ${unexpected.join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
