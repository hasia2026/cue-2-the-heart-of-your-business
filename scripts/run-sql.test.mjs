// Regression test for scripts/run-sql.mjs.
//
// The runner must hand the whole SQL file to Postgres instead of splitting on
// semicolons. A temporary database keeps the fixture away from application
// data; it is force-dropped in finally even when an assertion fails.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import postgres from "postgres";

const quoteIdent = (value) => `"${value.replace(/"/g, '""')}"`;

test("run-sql preserves semicolons inside SQL syntax and comments", async () => {
  const baseUrl = process.env.DATABASE_URL;
  assert.ok(baseUrl, "DATABASE_URL is required (run with --env-file=.env)");

  const database = `cue_run_sql_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dbUrl = new URL(baseUrl);
  dbUrl.pathname = `/${database}`;
  // The runner rejects Supabase's pooled port for DDL. Session mode on 5432
  // is the DDL-safe equivalent of the same database.
  if (dbUrl.port === "6543") dbUrl.port = "5432";

  const admin = postgres(baseUrl, { max: 1, prepare: false });
  const dir = await mkdtemp(join(tmpdir(), "cue-run-sql-"));
  const fixture = join(dir, "quoted-semicolons.sql");
  let testDb;
  let created = false;

  try {
    await admin.unsafe(`create database ${quoteIdent(database)}`);
    created = true;

    await writeFile(fixture, `
create table regression_values (
  id integer primary key,
  label text not null
);

-- A line comment can contain a semicolon ; without ending a statement.
insert into regression_values (id, label)
values (1, 'single; quote''s semicolon');

/* A block comment can contain a semicolon ; and an apostrophe too. */
insert into regression_values (id, label)
values (2, E'line\\nbreak; semicolon');

insert into regression_values (id, label)
values (3, $dollar$dollar;quoted$dollar$);

do $do$
begin
  insert into regression_values (id, label)
  values (4, 'inside;do');

  update regression_values
  set label = label || ';updated'
  where id = 4;
end
$do$;

insert into regression_values (id, label)
values (5, 'after;do');
`, "utf8");

    const result = spawnSync(
      process.execPath,
      ["scripts/run-sql.mjs", fixture],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: baseUrl, MIGRATION_DATABASE_URL: dbUrl.toString() },
        encoding: "utf8",
      },
    );
    assert.equal(
      result.status,
      0,
      `run-sql exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.match(result.stdout, /applied/);

    testDb = postgres(dbUrl.toString(), { max: 1, prepare: false });
    const rows = await testDb`
      select id, label from regression_values order by id`;
    assert.deepEqual(
      rows.map((row) => ({ id: row.id, label: row.label })),
      [
        { id: 1, label: "single; quote's semicolon" },
        { id: 2, label: "line\nbreak; semicolon" },
        { id: 3, label: "dollar;quoted" },
        { id: 4, label: "inside;do;updated" },
        { id: 5, label: "after;do" },
      ],
    );
  } finally {
    try {
      if (testDb) await testDb.end();
    } finally {
      try {
        if (created) {
          await admin.unsafe(`drop database ${quoteIdent(database)} with (force)`);
        }
      } finally {
        await admin.end();
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
});
