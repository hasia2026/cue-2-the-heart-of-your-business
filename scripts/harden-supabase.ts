/**
 * Supabase hardening for CUE's custom-auth architecture.
 *
 * Threat model: CUE authenticates users itself (HMAC cookie + User table).
 * It talks to Postgres ONLY through Prisma as the `postgres` role (table
 * owner). The Supabase Data API (PostgREST) uses `anon`/`authenticated`
 * roles — those must have ZERO access to CUE tables, because the anon key
 * is public-by-design and CUE's sessions never produce Supabase JWTs.
 *
 * Strategy (deliberately NOT per-org RLS policies — see SECURITY.md):
 *   1. Revoke ALL on public tables/sequences/schema from anon + authenticated.
 *      → Data API becomes structurally unable to read or write anything.
 *   2. Enable RLS on every public table with NO policies (default deny).
 *      → Defense in depth: even if a grant reappears, zero rows pass.
 *   3. Default privileges + event trigger: every future table is born
 *      revoked and RLS-enabled, so db push can't silently reopen access.
 *   4. Add missing FK indexes (performance advisor findings).
 *
 * Idempotent: safe to re-run. Run against DIRECT_URL (DDL-capable):
 *   DIRECT_URL="postgresql://..." npx tsx scripts/harden-supabase.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL! } } });

  console.log("── 1. Revoke Data API roles on everything in public ──");
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`);
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`);
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated`);
  await prisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM anon, authenticated`);
  console.log("   revoked tables/sequences/functions/schema from anon + authenticated");

  console.log("── 2. Enable RLS (deny-all, no policies) on every public table ──");
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tablename}" ENABLE ROW LEVEL SECURITY`);
  }
  console.log(`   RLS enabled (no policies = deny-all) on ${tables.length} tables`);

  console.log("── 3. Future tables: default-privilege lock + event trigger ──");
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated`);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.cue_lockdown_new_table() RETURNS event_trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF tg_tag = 'CREATE TABLE' THEN
        PERFORM 1;
        FOR r IN SELECT objid::regclass AS reg FROM pg_event_trigger_ddl_commands()
        LOOP
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.reg);
          EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', r.reg);
        END LOOP;
      END IF;
    END;
    $fn$;
  `).catch(async () => {
    // plpgsql variable declaration needs the FOR loop declared properly —
    // fall back to a simpler, still-correct implementation
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.cue_lockdown_new_table() CASCADE`);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.cue_lockdown_new_table() RETURNS event_trigger
      LANGUAGE plpgsql AS $fn$
      DECLARE
        r record;
      BEGIN
        IF tg_tag = 'CREATE TABLE' THEN
          FOR r IN SELECT objid::regclass AS reg FROM pg_event_trigger_ddl_commands()
          LOOP
            EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.reg);
            EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', r.reg);
          END LOOP;
        END IF;
      END;
      $fn$;
    `);
  });

  await prisma.$executeRawUnsafe(`DROP EVENT TRIGGER IF EXISTS cue_lockdown_trigger`);
  await prisma.$executeRawUnsafe(`CREATE EVENT TRIGGER cue_lockdown_trigger ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.cue_lockdown_new_table()`);
  console.log("   default privileges revoked + event trigger created (future tables auto-locked)");

  console.log("── 4. Missing FK indexes (performance advisor) ──");
  // Find FK columns without a leading index on (fk_col, ...) — table is 267 rows,
  // so plain CREATE INDEX (brief lock) is fine; CONCURRENTLY not needed yet.
  const missing = await prisma.$queryRawUnsafe<{ tbl: string; col: string; fk: string }[]>(`
    SELECT
      c.conrelid::regclass::text AS tbl,
      a.attname AS col,
      c.conname AS fk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
          AND a.attnum = (i.indkey::int2[])[0]
      )
    GROUP BY c.conrelid, a.attname, c.conname
    ORDER BY 1, 2
  `);
  let made = 0;
  for (const { tbl, col } of missing) {
    const idxName = `fk_${tbl.replace(/"/g, "").toLowerCase()}_${col}`.replace(/\./g, "_").slice(0, 60);
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${idxName}" ON ${tbl}("${col}")`);
      made++;
    } catch (e) {
      console.log(`   skip ${tbl}.${col}: ${(e as Error).message.split("\n")[0].slice(0, 80)}`);
    }
  }
  console.log(`   created ${made} FK index(es) for ${missing.length} missing`);

  console.log("── 5. Verification ──");
  const grants = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated')`
  );
  const rlsOn = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND rowsecurity = true`
  );
  console.log(`   grants to anon/authenticated on public tables: ${grants[0].count} (want 0)`);
  console.log(`   public tables with RLS enabled: ${rlsOn[0].count}/${tables.length}`);
  if (Number(grants[0].count) !== 0) throw new Error("hardening incomplete — grants remain");

  await prisma.$disconnect();
  console.log("\nHARDENED: Data API locked out; app path (Prisma as postgres/owner) unaffected.");
}
main().catch((e) => { console.error("HARDENING FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
