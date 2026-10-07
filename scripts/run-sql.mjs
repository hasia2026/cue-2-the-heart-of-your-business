#!/usr/bin/env node
// Applies a .sql file to the Supabase Postgres database, statement by statement.
// Usage: node --env-file=.env scripts/run-sql.mjs <file.sql>
// NOTE: full-line `--` comments are stripped BEFORE splitting on `;` because
// comment text can itself contain semicolons.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
const stripped = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const statements = stripped
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 20 });
let failed = 0;
try {
  for (const stmt of statements) {
    const firstLine = stmt.split("\n").find((l) => l.trim()) ?? "";
    try {
      const rows = await sql.unsafe(stmt);
      const label = rows.length ? `${rows.length} row(s)` : "ok";
      console.log(`✔ ${label} — ${firstLine.slice(0, 90)}`);
      if (rows.length && rows.length <= 20 && firstLine.toLowerCase().startsWith("select")) {
        console.log("  " + JSON.stringify(rows));
      }
    } catch (e) {
      failed++;
      console.error(`✖ FAILED — ${firstLine.slice(0, 90)}\n  ${e.message}`);
    }
  }
} finally {
  await sql.end();
}
process.exitCode = failed ? 1 : 0;
