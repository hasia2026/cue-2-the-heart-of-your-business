# CUE — run doc

## ✅ Supabase is LIVE (migrated)
- Project ref `mgqwvgzhyqfscnnwejeh`, region **ca-central-1** (user picked Canada). Password known to user — rotate if ever shared.
- `.env` points at Supabase: `DATABASE_URL` = transaction pooler `aws-0-ca-central-1.pooler.supabase.com:6543` (pgbouncer), `DIRECT_URL` = session pooler `:5432` (IPv4-friendly — the bare `db.<ref>.supabase.co` host is IPv6-only on this network). `CUE_SESSION_SECRET` generated in `.env`.
- Schema pushed + all 267 rows imported (Summit Home Services + Riverside Auto Group; 5 leftover `__test*` scratch orgs cleaned from SQLite first via `scripts/cleanup-test-orgs.ts`).
- Export/import scripts cover ALL tables incl. training/messages/signals/GBP.
- Verified on Postgres: smoke-four 8/8, smoke-crm 12/12, `scripts/test-signup-flow.ts` (signup → starter data → briefing, self-cleaning). Starter data now seeds sample communications for customer-360 timelines.
- Vercel env vars when deploying: `DATABASE_URL`, `DIRECT_URL` (from `.env`), plus `CUE_SESSION_SECRET`. Full runbook: DEPLOY.md.
- Dev server now runs against Supabase by default (nothing SQLite-specific left in `.env`).

## 3. Supabase Postgres migration (SQLite → Supabase)

The canonical schema is `prisma/schema.prisma` (SQLite, local dev). A generated Postgres copy lives at `prisma/schema.postgres.prisma` — regenerate after any schema change with `npm run db:pg:schema`.

**One-time setup (needs the user's Supabase project):**

1. In Supabase: create a project, then **Connect** (top bar) → copy the connection string. Put TWO URLs in `.env` (see `.env.example` for exact format):
   - `DATABASE_URL` — pooled (port 6543, `?pgbouncer=true`), used by the app at runtime
   - `DIRECT_URL` — direct (port 5432), used by Prisma for DDL (`db push`)
2. Create the schema in Supabase: `npm run db:pg:push`
3. Generate the Prisma client for Postgres: `npm run db:pg:generate`
4. Migrate the data: `npm run db:export` (SQLite → `data/bizmo-export.json`), then `npm run db:pg:import` (JSON → Postgres; refuses to overwrite a non-empty DB unless `--force`)
   - One command does all four: `npm run db:migrate-to-pg`
5. Point the app at Postgres: `.env` keeps `DATABASE_URL` = the Supabase pooled URL (Prisma client picks it up automatically; the app code never changes).
6. Verify: `npx tsx scripts/verify-dealership.ts` and `npx tsx scripts/verify-seed.ts` read through the same Prisma client — they should print the same insight counts as SQLite.

**Note on the client:** `db:pg:generate` replaces the generated client with the Postgres one. For daily local dev you can regenerate the SQLite client with `npx prisma generate` — the app code is identical either way.

**Row Level Security:** Supabase's Postgres supports RLS; Bizmo enforces org isolation in application code (every query is scoped by `organizationId`). For production hardening, add RLS policies mirroring that scoping — recommended before onboarding external pilot tenants.

## 1. Reproduce uncommitted artifacts (fresh checkout)

1. Install dependencies with the project's package manager:
   - `npm install`
2. Environment file: `.env` already exists in the repo root (it is local-only, not committed). For a fresh machine, copy `.env` from the main checkout at `C:\Users\user\Desktop\Projects`, or create it with:
   - `DATABASE_URL="file:./db/custom.db"` (SQLite, relative to `prisma/`)
   - `BIZMO_SESSION_SECRET="<any long random hex>"`
   - `BIZMO_DEMO_MODE="true"`
   (Never commit real secrets. The run doc records the procedure, not values.)
3. Create the database schema:
   - `npx prisma db push`
4. Seed the Summit Home Services demo workspace (idempotent; wipes + reseeds):
   - `npx tsx prisma/seed.ts`
   - Verify with `npx tsx scripts/verify-seed.ts` (should print 4 insights; unbilled $12,480 / estimates $38,700).

Note: Node must be on PATH (`C:\Program Files\nodejs`). In Git Bash: `export PATH="/c/Program Files/nodejs:$PATH"`.

## 2. Run the server

- Dev server (used for preview): `npm run dev` → serves on **http://localhost:3210** (port pinned in package.json scripts via `-p 3210`).
- Production build alternative: `npm run build` then `npm run start` (same port). Stop any process already listening on 3210 first (`netstat -ano | findstr :3210`).
- Detached start recipe (Windows): run `powershell -Command "Start-Process -FilePath '.freebuff\dev-start.cmd' -WindowStyle Hidden"`. The wrapper cmd sets the node PATH itself (a bare `npm run dev` detached from Git Bash loses PATH and fails with "'npm' is not recognized"), logs to `.freebuff/preview-*.log(.err)`. Kill with the netstat/taskkill recipe below.
- If pages 500 with `Cannot read properties of undefined (reading 'findMany')` on a Prisma model right after a schema change: the long-running dev server holds a stale generated client — kill it, `npx prisma generate`, restart. Scripts run via `tsx` pick up the fresh client, which is why they pass while pages fail.
- Smoke test: start server, then `npx tsx scripts/smoke.ts` (all routes should pass; requires the server answering on 3210).
- Market Signals ingest (auth: `Authorization: Bearer <org.ingestKey>`): `POST /api/ingest/signals` (social-listening webhooks / RSS bridges; loose field mapping) and `POST /api/ingest/google` (GBP reviews & messages). Keys live on `Organization.ingestKey`, surfaced in /signals → "Watches & webhooks". Dedupe is content-hash + externalId based, so replayed/renamed alerts never double-count. Tests: `npx tsx scripts/test-signals.ts` (lib, no server), `npx tsx scripts/smoke-signals-http.ts` (live server).
- Sign-in for the demo: `owner@summithome.demo` / `demo1234` (seeded by step 4 above).
