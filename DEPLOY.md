# Deploying CUE to Vercel + Supabase (your own domain)

CUE is a Next.js 15 App Router app. Vercel hosts it natively; Supabase
provides the Postgres database (SQLite cannot run on serverless — this is
the one hard requirement).

---

## 0. Prerequisites

- A [Supabase](https://supabase.com) account (free tier works for a pilot)
- A [Vercel](https://vercel.com) account (free Hobby tier works)
- Your domain (you can add it after the app is live)

## 1. Create the Supabase database

1. Supabase → **New project** (pick a region close to your users, e.g. `us-west-1` for California).
2. When ready, open **Connect** (top bar) and copy both connection strings:
   - **Pooled** (port `6543`) → this is `DATABASE_URL`
   - **Direct** (port `5432`) → this is `DIRECT_URL`
3. Format them exactly as in `.env.example`:

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.supabase.com:5432/postgres"
```

4. Create the schema (one-time, from your machine):

```bash
# put the two URLs above into .env first, then:
set DATABASE_URL=<pooled-url>          # Windows Git Bash: export DATABASE_URL=...
set DIRECT_URL=<direct-url>
npm run db:pg:push        # creates all tables in Supabase
npm run db:pg:generate    # generates the Postgres Prisma client
```

5. Optional — copy your local demo/pilot data up:

```bash
npm run db:export         # SQLite → data/bizmo-export.json
npm run db:pg:import      # JSON → Supabase (refuses non-empty DB unless --force)
```

## 2. Get the code to GitHub

Vercel deploys from git (recommended — every push gets a preview URL):

```bash
git init
git add -A
npm run test:secrets      # scans the STAGED files — exits non-zero if any secret is included
git commit -m "CUE — initial deploy"
# create a repo on github.com, then:
git remote add origin https://github.com/<you>/cue.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules`, `db/custom.db`, uploads, logs, and local tool state (`.freebuff` logs, `.vercel`) — nothing secret gets pushed. Re-run `npm run test:secrets` before every push as the final check.

## 3. Import the project into Vercel

1. Vercel → **Add New… → Project** → pick the `cue` repo.
2. Framework preset auto-detects **Next.js**. Build command (`vercel-build`) and install are automatic:
   `vercel-build` generates the **Postgres** Prisma client before building.
3. Before the first deploy, add **Environment Variables** (Project → Settings → Environment Variables) — copy each from `.env.example`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooled** URL (with `?pgbouncer=true&connection_limit=5`) |
| `DIRECT_URL` | Supabase **direct** URL |
| `CUE_SESSION_SECRET` | 64 random hex chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` — enables persistent file uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (server-only secret) |

   ⚠️ `CUE_SESSION_SECRET` is **required in production**: it signs every login
   cookie. Without it the app falls back to a public dev value. Set it once and
   never rotate casually — rotating it signs everyone out.

4. **Deploy.** First build takes a few minutes.

## 4. Point your domain at it

1. Vercel → Project → **Settings → Domains → Add** → enter `app.yourdomain.com`.
2. Vercel shows the DNS records to create — usually:
   - `CNAME` record, host `app`, value `cname.vercel-dns.com`
   - (for the apex/root domain: an `A` record to `76.76.21.21`, or transfer nameservers)
3. Create the record at your registrar (GoDaddy/Namecheap/Cloudflare…). DNS propagates in minutes-to-hours; Vercel issues the TLS certificate automatically.
4. Set the production domain as **Production** in Vercel; other branches deploy as preview URLs.

## 5. Verify the deployment

```bash
curl -s https://app.yourdomain.com/api/health 2>/dev/null; open https://app.yourdomain.com/signin
```

- Sign in → dashboard loads with real data (if you imported) or run the signup wizard
- Go to **Market Signals → Watches & webhooks**, copy the ingest key, and test the live webhook:

```bash
curl -X POST https://app.yourdomain.com/api/ingest/signals \
  -H "Authorization: Bearer <ingest-key>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Looking to buy a truck near Riverside","author":"test_user"}'
```

- The signal should appear in the inbox within a second.

## Production hardening (built in)

- **Rate limiting** — signin (10/min per IP + 5/5min per account), signup (3/min per IP), ingest endpoints (60/min per key, returns `429` + `Retry-After`), upload signing (20/min per user). In-memory fixed-window; per-instance on serverless. Swap `src/lib/ratelimit.ts`'s Map for Redis/Upstash for cross-instance quotas — call sites unchanged.
- **Health check** — `GET /api/health` returns `200 healthy` / `503 unhealthy` with per-check flags (`database`, `storageBackend`). Point uptime monitors at it; never cached.
- **Large video uploads** — files >20MB upload **directly from the browser to Supabase Storage** via `POST /api/uploads/sign` (signed URL, 10-min expiry, 500MB cap, video content-type enforced), with a live progress bar. This bypasses the ~4.5MB serverless request-body ceiling. Files ≤20MB go through the normal form path. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

## Known platform constraints (read before go-live)

| Constraint | Impact | Recommendation |
|---|---|---|
| `public/uploads` is **ephemeral** on Vercel | Training videos and uploaded files vanish on redeploy | Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and uploads automatically go to Supabase Storage (persistent) — no code changes needed |
| Serverless = no long-running processes | Workflows execute on page load (as designed) | Nothing to do |
| Connection pool limits | `connection_limit=5` via pgBouncer is set | Fine for ≤50 concurrent users; raise later on Supabase's side |
| Cron jobs (Morning Briefing email, etc.) | Not yet scheduled | Add Vercel Cron later if wanted |

## Updating after go-live

```bash
git push          # → preview deploy → merge → production
```

Schema changes: edit `prisma/schema.prisma` → `npm run db:pg:schema` → commit →
then run `npm run db:pg:push` against Supabase (locally with prod `DIRECT_URL`)
**before** the deploy that uses the new fields.

## Cost snapshot (pilot scale)

| Item | Cost |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free (500 MB Postgres) | $0 |
| Domain | ~$10–15/yr |
| **Total** | **~$1/month** until you outgrow free tiers |
