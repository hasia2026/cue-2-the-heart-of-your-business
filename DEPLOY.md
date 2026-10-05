# Deploying CUE to Vercel + Supabase

## 1. Supabase (once)

```bash
# apply schema
node --env-file=.env scripts/db-setup.mjs

# (optional) load the dealership demo
node --env-file=.env scripts/seed-dealership.mjs
```

For production, rotate the database password first (Supabase → Settings → Database),
and ideally create a dedicated role instead of using `postgres`.

## 2. GitHub

Push this repo to GitHub (e.g. `hasia2026/cue-2-the-heart-of-your-business`).

## 3. Vercel

1. Import the repo on Vercel.
2. Environment variables (Production + Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | **Pooled** connection string: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| `CUE_SESSION_SECRET` | 64-char hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

   Notes:
   - Use the **pooled** (port 6543) URL on Vercel — serverless functions need pooling.
   - Keep the **direct** (port 5432) URL in local `.env` for `db:setup` / seeding / DDL.
   - `postgres.js` runs with `prepare: false`, which is pgbouncer/Supavisor-safe.

3. Deploy. Framework preset: Next.js (auto-detected). Build command: `next build`.

## 4. Post-deploy checks

```bash
curl https://<your-app>.vercel.app/api/health   # → {"ok":true,"db":"up"}
```

- Sign in, open Dashboard → insights should appear (run Understand → Refresh intelligence on a fresh org).
- Verify the language switcher (EN/ES/VI/AR) and that Arabic renders RTL.

## 5. Pilot checklist

See PRODUCTION-CHECKLIST.md for the go-live gate (secrets rotation, backups, RLS posture, monitoring).
