# CUE Security Architecture

**Status: hardened 2026-09-29.** This document maps CUE's authentication to
the database authorization layer, records what was locked down and why, and
sketches the path to per-organization RLS if/when it's wanted.

---

## 1. How CUE sessions map to the database

CUE runs **its own authentication** — deliberately NOT Supabase Auth:

```
Browser ── cue_session cookie (HMAC-signed userId, httpOnly) ──▶ Next.js server
Next.js ── Prisma, role `postgres` (table owner), pooled 6543 ──▶ Supabase Postgres
```

- `src/lib/session.ts` signs `userId.expiry` with `CUE_SESSION_SECRET`.
- `src/lib/auth.ts` resolves the userId → `Member` row → active
  organization (membership-verified `cue_org` cookie).
- **Every Prisma query is scoped by `organizationId` in application code**,
  and every table carries `organizationId` (org-level isolation by schema).
- The app NEVER uses the Supabase Data API, Supabase Auth JWTs, or the
  `anon`/`authenticated` roles. The only key the server holds is the DB
  password for the `postgres` role.

## 2. Threat model and what was locked down

The Supabase Data API (PostgREST at `<ref>.supabase.co/rest/v1`) executes
queries as `anon` or `authenticated`. The **anon key is public by design** —
it appears in any Supabase client bundle. Before hardening, if grants had
existed, that key could read every table. CUE never uses that API, so:

| Layer | Action |
|---|---|
| Grants | `REVOKE ALL` on all tables/sequences/functions + `USAGE` on `public` from `anon`, `authenticated` |
| RLS | **Enabled on all 43 public tables with zero policies** (default deny) — defense in depth |
| Future tables | `ALTER DEFAULT PRIVILEGES` revoke + `cue_lockdown_trigger` event trigger: any new table is born RLS-on and revoked |
| API probe | `scripts/probe-rest-exposure.ts` verifies the anon key cannot read `Organization`, `User`, `Customer`, `Lead`, `Message`, `AuditEvent` |
| Performance | 31 missing FK indexes created (clears the advisor findings) |

Result: the Data API is **structurally locked out** (no grants *and* deny-all
RLS), verified by probe. The advisor's 43 findings are resolved.

## 3. Per-organization RLS — INSTALLED AND EMPIRICALLY VERIFIED

**Status: 43/43 policies live.** Derived from CUE's own membership model,
not from `auth.uid()` (CUE has no Supabase Auth identities):

- **Session contract**: `app.current_org` — a database session setting that
  can only come from a trusted SQL path (`SET LOCAL` inside a connection),
  never from client-supplied headers. Unset/empty ⇒ NULL ⇒ every row denied.
- **Policy shape** (`cue_org_isolation`, `TO public`, `FOR ALL`, `USING` +
  `WITH CHECK`):
  - 36 tables with `organizationId`: `organizationId = app.current_org`
  - 7 tables without it use parent/membership EXISTS clauses:
    `Organization` (id match) · `User` (via Member) · `Message` /
    `ThreadParticipant` (via thread) · `LessonQuiz` (via lesson) ·
    `TrainingAssignment` (via employee) · `Goal` (via profile)
- **Owner path untouched**: policies are NOT forced — Prisma connects as
  the `postgres` owner and bypasses RLS by design. The application remains
  the authorization boundary (auth.ts + organizationId predicates); the
  policies now also hold for any future non-owner role.
- **Lockdown trigger fixed**: filters `pg_event_trigger_ddl_commands()` to
  real tables (`object_type='table' AND relkind='r'` — the old version
  choked on auto-created PK indexes), `SECURITY INVOKER`, hardened
  `search_path`, and **test-fired**: a probe table is born RLS-enabled +
  revoked from API roles.
- **Empirical proof** (`scripts/rls-org-policies.ts` §4, re-runnable): a
  dedicated non-owner role (`cue_rls_probe`) with `SET LOCAL ROLE` +
  `SET LOCAL app.current_org` sees exactly its org's rows (counts match
  owner-path ground truth), sees ZERO rows of the other org, zero rows
  when the org is unset, membership-derived `User` visibility works, and
  cross-org INSERT is rejected by `WITH CHECK`.
- **App enforcement posture (audited 2026-09-29)**: the application does
  NOT currently set `app.current_org` — a full-text audit of `src/` finds
  no `app.current_org` / `set_config` / `current_setting` reference, and
  Prisma connects as the table owner (`postgres`), which bypasses RLS by
  definition. **The enforcement boundary for app traffic is the
  application layer** (auth.ts session→Member→active org + explicit
  `organizationId` predicates on every query). The 43 policies are a
  dormant safety net governing any non-owner role; they are verified
  correct against live data but do not execute for app traffic today.
  Activating them as the primary boundary is a deliberate next step
  (session var middleware through Prisma + regression), not an existing
  guarantee — do not claim RLS as an app-layer control in customer
  materials until that ships.
- **Defense in depth stack**: zero grants to anon/authenticated (Data API
  structurally locked, probe-verified) → deny-all-if-unset org policies →
  application-layer org scoping → audit log.

If a new table is added: the lockdown trigger auto-enables RLS + revokes
API roles; run `scripts/rls-org-policies.ts` to add its org policy (it
fails loudly if a table has no known org linkage, rather than leaving a
black hole).

## 4. Re-verification commands

```bash
# Data API lockout probe (anon key must see nothing)
ANON_KEY=<anon> npx tsx scripts/probe-rest-exposure.ts

# Install/refresh per-org policies + empirical isolation proof
# (same via npm: `npm run test:rls` — loads .env)
DIRECT_URL=<direct> npx tsx scripts/rls-org-policies.ts

# App regression (server up)
npx tsx scripts/smoke-four.ts && npx tsx scripts/test-signup-flow.ts \
  && npx tsx scripts/test-crm.ts && npx tsx scripts/test-signals.ts \
  && npx tsx scripts/test-team-storage.ts
```

## 5. Remaining security work (tracked)

- [ ] Secrets hygiene: DB password and session secret live in `.env` / Vercel env only; rotate the DB password shared in chat before go-live (Supabase → Settings → Database → Reset database password).
- [ ] Storage bucket: `cue-uploads` is public-read via unguessable paths — acceptable for training videos; move sensitive documents to a private bucket + signed read URLs before storing PII.
- [ ] Consider Supabase PITR / scheduled backups before real customer data.
- [ ] `/api/health` deliberately leaks no internals; keep it that way.
