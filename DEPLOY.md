# Deploying CUE to Vercel + Supabase

## 1. Supabase (once)

```bash
# apply schema (includes both migrations below)
node --env-file=.env scripts/db-setup.mjs

# (optional) load the dealership demo — self-verifies at the end of the run
# and hard-fails if any org ends up with duplicate folder names
node --env-file=.env scripts/seed-dealership.mjs
```

### Migrations

`scripts/run-sql.mjs` applies `scripts/*.sql` files (already included in
`db-setup` when scripts/schema.sql runs; only needed on databases set up
before these existed):

| Migration | What it does | Why it exists |
|---|---|---|
| `scripts/migrate-departments-dedupe.sql` | Merges duplicate same-org folder rows, re-points old references to a single shared row, and adds a unique `(organization_id, name)` index | Folder creation is find-or-create; this makes duplicate departments impossible after seed reruns or races |
| `scripts/migrate-doc-content-hash.sql` | Adds `documents.content_hash` + a `(organization_id, content_hash)` index | The capture duplicate detector hashes file bytes / note text and blocks re-uploads; no index = slow lookups as documents grow |
| `scripts/migrate-market-signals.sql` | Adds the `market_signals` table + dedupe/org indexes | Market Signals: social-listening and GBP webhooks land here (`/api/ingest/*`); every database set up before this table existed needs it |
| `scripts/migrate-lead-alerts.sql` | Adds `lead_alert_queue` (retry ledger) + partial index on undelivered rows | Pilot-request alert emails that fail get queued and retried with backoff by the `/api/alerts/cron` Vercel cron instead of silently vanishing |
| `scripts/migrate-lead-push.sql` | Adds `lead_push_subscriptions` (unique endpoint, key checks) | Device registrations for the real-time Web Push "whisper" when a pilot request lands |

```bash
node --env-file=.env scripts/run-sql.mjs scripts/migrate-departments-dedupe.sql
node --env-file=.env scripts/run-sql.mjs scripts/migrate-doc-content-hash.sql
node --env-file=.env scripts/run-sql.mjs scripts/migrate-market-signals.sql
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
| `PILOT_REQUEST_EMAIL` | Where pilot-request alerts go. Accepts a **comma-separated list** — e.g. `shannon102501@gmail.com,pilots@hasi.tech` (the latter only after `docs/resend-domain-dns.md` verification). Empty = built-in `shannon102501@gmail.com` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keypair (`npx web-push generate-vapid-keys`) — powers the free phone «whisper» for pilot requests; unset = push off, email alerts unchanged |
| `VAPID_SUBJECT` | `mailto:<your email>` — contact address push services reach for abuse complaints; not customer-facing |

   Notes:
   - Use the **pooled** (port 6543) URL on Vercel — serverless functions need pooling.
   - Keep the **direct** (port 5432) URL in local `.env` for `db:setup` / seeding / DDL.
   - `postgres.js` runs with `prepare: false`, which is pgbouncer/Supavisor-safe.

3. Deploy. Framework preset: Next.js (auto-detected). Build command: `next build`.

## 4. Post-deploy checks

```bash
curl https://<your-app>.vercel.app/api/health   # → {"ok":true,"db":"up"}
```

### Lead-alert hardening (pilot funnel)

- New cron: `/api/alerts/cron` runs daily 06:10 UTC (`vercel.json`) — drains failed alert emails from `lead_alert_queue` (30 min → 24 h backoff, park after 8 tries) and emails the 24-hour lead summary to `PILOT_REQUEST_EMAIL`.
- Real-time channel: Pipeline → Scan-call leads → **Enable pings on this device**. Desktop/Android Chrome fires instantly; on iPhone, Add to Home Screen first (Apple requirement).
- Sending domain: verify `hasi.tech` per `docs/resend-domain-dns.md`, then set `MAIL_FROM=CUE <pilot-alerts@hasi.tech>` and add `pilots@hasi.tech` to the inbox list.

- Sign in, open Dashboard → insights should appear (run Understand → Refresh intelligence on a fresh org).
- Verify the language switcher (EN/ES/VI/AR) and that Arabic renders RTL.
- Accessibility: open Settings — **Text size** defaults to **Large (112.5%)** on every new browser and profile; the cycles (Standard / Large / XL / Huge) and the three Display-accessibility toggles (Reduce motion, High contrast, Strong focus outlines) should persist across reloads (cookie-based).

## 5. Pilot checklist

See PRODUCTION-CHECKLIST.md for the go-live gate (secrets rotation, backups, RLS posture, monitoring).
