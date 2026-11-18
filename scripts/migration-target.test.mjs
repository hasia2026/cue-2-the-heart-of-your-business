import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertFreshAllowed, resolveMigrationUrl } from "./migration-target.mjs";

const pooled = "postgresql://user:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
const session = "postgresql://user:pass@aws-0-us-west-1.pooler.supabase.com:5432/postgres";

test("migration URL prefers MIGRATION_DATABASE_URL and rejects pooler ports", () => {
  assert.equal(resolveMigrationUrl({ DATABASE_URL: pooled, MIGRATION_DATABASE_URL: session }), session);
  assert.equal(resolveMigrationUrl({ DATABASE_URL: session }), session);
  assert.throws(() => resolveMigrationUrl({ DATABASE_URL: pooled }), /pooled connection/);
  assert.throws(
    () => resolveMigrationUrl({ MIGRATION_DATABASE_URL: `${session}?pgbouncer=true` }),
    /pooled connection/,
  );
});

test("fresh reset requires confirmation outside local hosts", () => {
  assert.doesNotThrow(() => assertFreshAllowed(new URL("postgresql://localhost:5432/postgres"), false));
  assert.doesNotThrow(() => assertFreshAllowed(new URL(session), true));
  assert.throws(() => assertFreshAllowed(new URL(session), false), /--confirm-fresh/);
});

test("db-setup rejects a pooled URL before connecting", () => {
  const result = spawnSync(process.execPath, ["scripts/db-setup.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: pooled, MIGRATION_DATABASE_URL: pooled },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pooled connection/);
});

test("db-setup refuses non-local --fresh without confirmation", () => {
  const result = spawnSync(process.execPath, ["scripts/db-setup.mjs", "--fresh"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: session, MIGRATION_DATABASE_URL: session },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--confirm-fresh/);
});
