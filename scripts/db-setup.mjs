#!/usr/bin/env node
// Applies scripts/schema.sql to the Supabase Postgres database.
// Usage: node --env-file=.env scripts/db-setup.mjs [--fresh]
//   --fresh: drops the public schema first (destructive — demo/dev only).
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const fresh = process.argv.includes("--fresh");
const sql = postgres(url, { max: 1, connect_timeout: 20 });

try {
  if (fresh) {
    console.log("Dropping public schema (fresh reset)…");
    await sql.unsafe(`drop schema public cascade; create schema public;`);
  }
  const ddl = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await sql.unsafe(ddl);
  const [row] = await sql`select count(*)::int as tables from information_schema.tables where table_schema = 'public'`;
  console.log(`Schema applied. ${row.tables} tables in public.`);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
