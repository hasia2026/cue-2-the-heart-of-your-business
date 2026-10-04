/**
 * Updates .env in place for Supabase operation:
 *   DATABASE_URL (pooled, ca-central-1:6543), DIRECT_URL (db host:5432),
 *   CUE_SESSION_SECRET (generated if absent).
 * Prints only key NAMES and non-secret values (hosts), never passwords.
 */
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

const REF = "mgqwvgzhyqfscnnwejeh";
const PW = process.env.PW;
if (!PW) { console.error("PW env var required"); process.exit(1); }
const REGION = "ca-central-1";

const POOLED = `postgresql://postgres.${REF}:${PW}@aws-0-${REGION}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5`;
const DIRECT = `postgresql://postgres.${REF}:${PW}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`;

const envPath = path.join(__dirname, "..", ".env");
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

function setKey(text, key, value) {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}="${value}"`);
  return text.trimEnd() + `\n${key}="${value}"\n`;
}

env = setKey(env, "DATABASE_URL", POOLED);
env = setKey(env, "DIRECT_URL", DIRECT);

if (!/^\s*CUE_SESSION_SECRET\s*=/m.test(env)) {
  env = setKey(env, "CUE_SESSION_SECRET", randomBytes(32).toString("hex"));
  console.log("CUE_SESSION_SECRET: generated (new)");
} else {
  console.log("CUE_SESSION_SECRET: kept (already set)");
}
if (!/^\s*BIZMO_SESSION_SECRET\s*=/m.test(env)) {
  env = setKey(env, "BIZMO_SESSION_SECRET", process.env.CUE_SESSION_SECRET_KEPT || "");
  // only add alias when a legacy value existed; otherwise skip
  env = env.replace(/BIZMO_SESSION_SECRET=""\n/, "");
}

fs.writeFileSync(envPath, env);
console.log("DATABASE_URL →", `aws-0-${REGION}.pooler.supabase.com:6543 (pooled)`);
console.log("DIRECT_URL   →", `aws-0-${REGION}.pooler.supabase.com:5432 (session pooler, IPv4-friendly)`);
console.log(".env updated.");
