#!/usr/bin/env node
// Applies one .sql file as a single Postgres batch. Running the file whole
// (instead of splitting on semicolons) keeps comments, quoted semicolons and
// DO $$ blocks intact, and a failure rolls back the batch.
//
// Usage:
//   node --env-file=.env scripts/run-sql.mjs <file.sql>
//   node --env-file=.env scripts/run-sql.mjs <file.sql> --require-all-true
//
// --require-all-true is for verification queries: every boolean value returned
// must be true, otherwise the process exits non-zero.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const requireAllTrue = args.includes("--require-all-true");

if (!file) {
  console.error("Usage: node --env-file=.env scripts/run-sql.mjs <file.sql> [--require-all-true]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 20, onnotice: () => {} });

try {
  const result = await sql.unsafe(readFileSync(file, "utf8"));

  if (requireAllTrue) {
    const rows = Array.isArray(result) ? result.flat(Infinity) : [result];
    const checks = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rowLabel =
        typeof row.label === "string" ? row.label :
        typeof row.check === "string" ? row.check :
        typeof row.name === "string" ? row.name :
        "check";
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === "boolean") {
          checks.push({ key: key === "ok" ? rowLabel : `${rowLabel}.${key}`, value });
        }
      }
    }
    if (!checks.length) {
      throw new Error("--require-all-true: no boolean check values were returned");
    }
    const failed = checks.filter((check) => !check.value);
    if (failed.length) {
      throw new Error(`verification failed: ${failed.map((check) => check.key).join(", ")}`);
    }
    console.log(`✔ ${checks.length} verification check(s) true`);
  }
  console.log(`✔ ${requireAllTrue ? "verified" : "applied"} — ${file}`);
} catch (e) {
  console.error(`✖ FAILED — ${file}\n  ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
