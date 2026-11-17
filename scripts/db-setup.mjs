#!/usr/bin/env node
// Applies scripts/schema.sql to the Supabase Postgres database, then applies
// every scripts/migrate-*.sql patch (all idempotent) so a rebuilt database
// can't drift from the code's expectations. New columns/tables added as
// migrations are picked up automatically here.
// Usage: node --env-file=.env scripts/db-setup.mjs [--fresh]
//   --fresh: drops the public schema first (destructive — demo/dev only).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const fresh = process.argv.includes("--fresh");
const sql = postgres(url, { max: 1, connect_timeout: 20, onnotice: () => {} });

let step = "initial setup";
try {
  if (fresh) {
    step = "drop public schema";
    console.log("Dropping public schema (fresh reset)…");
    await sql.unsafe(`drop schema public cascade; create schema public;`);
  }

  step = "schema.sql";
  const ddl = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await sql.unsafe(ddl);

  step = "list migrations";
  const migrations = readdirSync(fileURLToPath(new URL(".", import.meta.url)))
    .filter((f) => /^migrate-.*\.sql$/.test(f))
    .sort();
  for (const m of migrations) {
    step = m;
    const patch = readFileSync(new URL(`./${m}`, import.meta.url), "utf8");
    await sql.unsafe(patch);
    console.log(`  ✔ ${m}`);
  }

  step = "table count";
  const [row] = await sql`select count(*)::int as tables from information_schema.tables where table_schema = 'public'`;
  console.log(`Schema applied. ${row.tables} tables in public.`);
} catch (e) {
  // Stop at the first failure: continuing would apply later migrations against
  // a schema that already failed, hiding the real breakage.
  console.error(`FAILED (${step}): ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
