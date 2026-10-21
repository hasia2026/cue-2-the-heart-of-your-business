// Rotates demo-account passwords in the live database to match the updated
// seed scripts. Only touches the two demo orgs' seeded emails — no real users.
// Usage: set -a; source .env; set +a; node scripts/rotate-demo-passwords.mjs
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const DEMO_ACCOUNTS = {
  "demo@northgate.example": "northgate-demo-2026",
  "marcus@northgate.example": "northgate-demo-2026",
  "rachel@northgate.example": "northgate-mgr-2026",
  "tom@northgate.example": "northgate-staff-2026",
  "demo@summitair.example": "summit-demo-2026",
  "rita@summitair.example": "summit-admin-2026",
  "sam@summitair.example": "summit-mgr-2026",
  "chris@summitair.example": "summit-staff-2026",
};

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
      update users set password_hash = ${hashPassword(password)}
      where email = ${email}
      returning email`;
    console.log(rows.length ? `✔ ${email} → new password` : `• ${email} not present (skipped)`);
  }
  // Guardrail: confirm zero real (non-demo) accounts were touched.
  const [touched] = await sql`
    select count(*)::int as n from users
    where email not like '%northgate.example' and email not like '%summitair.example'
      and password_changed_at > now() - interval '5 seconds'`;
  console.log(`non-demo users modified in the last 5s: ${touched.n}`);
} finally {
  await sql.end();
}
