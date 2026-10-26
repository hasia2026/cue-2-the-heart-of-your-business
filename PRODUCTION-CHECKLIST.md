# CUE Production Readiness Checklist

## ✅ Done (v2 pilot foundation)
- [x] Prisma removed; raw parameterized SQL via `postgres.js` (pooler-safe)
- [x] 33-table org-scoped schema on Supabase Postgres
- [x] Auth: scrypt hashing, HMAC session cookie, sign-in/up/out
- [x] 14 authenticated pages + 5 API routes, all org-isolated
- [x] Evidence-first intelligence: 5 deterministic detectors (unbilled service, stale leads, aging inventory, finance bottleneck, overdue invoices)
- [x] Explainable Business Health score (7 dimensions, Score → Evidence → Reasoning → Confidence)
- [x] Human-in-the-loop decisions (Approve/Reject/Defer) + audit trail
- [x] Rec → workflow → record-level tasks (tested: 4 vehicle-reprice tasks generated)
- [x] Grounded CUE AI (answers from real data; refuses to fabricate)
- [x] i18n EN/ES/VI/AR with RTL Arabic
- [x] Auto-dealership Industry Pack demo (Northgate Auto Group)
- [x] Migrations shipped and idempotent: `migrate-departments-dedupe.sql` (unique `(organization_id, name)` folder index) and `migrate-doc-content-hash.sql` (`documents.content_hash` + org/hash index) — see DEPLOY.md
- [x] Text-size accessibility with **Large (112.5%) as the default** for new sessions (Standard / XL / Huge options; Settings + header `Aa` control, cookie-applied before first paint)
- [x] Display accessibility toggles beside text size: Reduce motion, High contrast, Strong focus outlines (cookie-driven, server-applied classes)
- [x] Capture duplicate detector: exact content hash, legacy name+size fallback, and fuzzy near-duplicate pass (title & note-text similarity over the last 90 days, with a "Save anyway" escape hatch)
- [x] Typecheck clean · production build passes · 62-check E2E smoke green

## 🔒 Before first real customer
- [x] Rate-limit `/api/assistant` + auth actions for public exposure
      (assistant 30/min/org, signup 5/h/IP, signin 10/15min, reset-request 5/h,
      reset-consume 10/h — `src/lib/rate-limit.ts` shared limiter, per-instance
      on Vercel; generous so normal usage + e2e never trips them)
- [x] Password-reset email wired via Resend ([reset-actions.ts](src/app/signin/reset-actions.ts):
      hashed single-use token, 60-min TTL, uniform rejection text, honest error
      when RESEND_API_KEY is missing or the address is unverified)
      → **remaining owner step:** set `RESEND_API_KEY` + verified `MAIL_FROM`
      in Vercel env; the code path is live either way
- [x] E2E gates green on every push (pre-push hook) — false-positive refresh
      probe fixed to verify via audit trail (ffe91db). The hook now also runs
      `tsc --noEmit` **before** the E2E smoke, so a prod-build type error like
      the one Vercel caught on f4lnhgay9 is caught at the hook, not in prod
- [ ] Rotate Supabase DB password + least-privilege app role — **owner console step**:
      ① Supabase → Settings → Database → Reset database password; ② copy the
      new password into the `DATABASE_URL` pooler connection string in
      Vercel env vars (and local `.env`); ③ optional least-privilege role:
      `create role cue_app nol; grant usage on schema public to cue_app;
      grant all on all tables/sequences in schema public to cue_app` then
      use `cue_app` instead of `postgres` in the URL (password-in-URL is the
      simpler Vercel option; dedicated role is the cleaner audit story)
- [ ] Fresh production `CUE_SESSION_SECRET` — **owner step**: `openssl rand -hex 32`
      locally, paste into Vercel env var `CUE_SESSION_SECRET` (Production only,
      distinct from dev). Rotating signs out all existing sessions; do it
      before the pilot invite, not after
- [ ] Enable Supabase PITR / scheduled backups — **owner console step**:
      Supabase → Settings → Backups → enable PITR (Pro plan+) or verify the
      included daily backup reached last-green state. Postgres best practice:
      restore into a scratch DB once to prove the backup is usable, not just present

## 🚀 Pilot hardening (first 5 dealerships)
- [ ] Replace seeded demo evidence refs with live DMS export (CSV ingest in Capture)
- [ ] Add employee invite flow (Settings → Team)
- [ ] Document real DMS integration: field mapping from CDK/Dealertrack exports
- [x] Weekly digest email — shipped: `/api/digest` cron daily 14:30 UTC
      (vercel.json), per-org on/off + send day + destination in Settings →
      "Weekly digest"; content spans open insights, pending decisions, and
      the new "Plan sign-ups this week" section
- [x] Uptime monitoring (internal): `/api/health` heartbeat, `/api/monitor/ping`
      cron daily 05:17 UTC, error ingest at `/api/monitor/log` guarded by
      `MONITOR_INGEST_TOKEN`, alerts to `ALERT_EMAIL`
- [x] Lead-alert hardening: pilot requests (scan form + score) notify
      `PILOT_REQUEST_EMAIL` (list-capable), failed alert emails retry with
      backoff from `lead_alert_queue` (cron `/api/alerts/cron` daily 06:10 UTC),
      and devices get real-time Web Push pings (VAPID keys; subscribe toggle on
      Pipeline → Scan-call leads)
- [x] Undelivered-alert visibility: Resend bounce/warning forwarder at
      `/api/webhooks/resend` (Svix-signed; refuses unsigned calls) records
      `email.bounced` / `email.delivery_delayed` / `email.complained` for
      digest, pilot-request, and hot-signal emails into `error_events`, so a
      bounced owner alert surfaces on **Monitor → errors** in-app. Recent
      hot-signal owner alerts (email + batched push, SENT/FAILED) are listed on
      **Signals → "Recent owner alerts"**
      — **owner step below (⑧)**
- [ ] External uptime monitor on `/api/health` (Better Stack / Vercel checks) —
      **owner step**: point a hosted monitor at `/api/health` so outages are
      caught independently of Vercel's own crons

## 🏭 Scale phase
- [ ] Move detectors to a scheduled job (Vercel Cron) with per-org fan-out
- [ ] Vector search for Knowledge (Supabase pgvector) to upgrade assistant retrieval
- [ ] Usage metering for pricing tiers (per-seat + per-connection)
- [ ] SOC 2 track: audit log retention policy, access reviews, incident runbook

## 🔎 Live status audit — 2026-10-22

What was checked against the running production deployment
(`https://cue-2-the-heart-of-your-business-1p66-scal33.vercel.app`):

- [x] `/api/health` → `{"ok":true,"db":"up"}`
- [x] `/signup` public page → 200 (rate-limited 5/h/IP); public service-plan
      signup at `/plans/<orgId>` live with tracked email CTAs
- [x] `/api/monitor/ping` → 401 unauthenticated (expected; cron passes the
      ingest token), `/api/monitor/log` guarded by `MONITOR_INGEST_TOKEN`
- [x] API guards verified in the E2E smoke (now 62 checks, including the
      pinned dev/prod-aligned `GET /api/quotes/send → 405 JSON + Allow: POST`
      and the new Market Signals ingest guards + dedupe)
- [x] Crons registered in `vercel.json`: digest 14:30 UTC, reminders 07:12 UTC,
      monitor ping 05:17 UTC

**Remaining go-live gaps (all owner console / Vercel dashboard steps, in
priority order):**

1. Rotate Supabase DB password + least-privilege app role (① in the section
   above) — DB password is still the original, in the pooled
   `DATABASE_URL` env var on Vercel
2. Fresh production `CUE_SESSION_SECRET` (distinct from dev) — signs out
   existing sessions, do it before the pilot invite
3. Set `RESEND_API_KEY` + verified `MAIL_FROM` in Vercel — until then password
   resets fail honestly with "email not configured"
4. Supabase PITR / scheduled backups, with one restore-into-scratch-DB drill
5. External `/api/health` monitor (Better Stack or equivalent)
6. Confirm `MONITOR_INGEST_TOKEN` is set non-empty in Production (per
   `.env.example`: signed-in owners are also accepted by `/api/monitor/log`,
   so an empty token means intake relies on sessions alone and the 05:17 UTC
   ping cron cannot authenticate)
7. WhatsApp Cloud creds (`WHATSAPP_*`) remain optional/undone — the channel
   honestly shows AVAILABLE but the webhook refuses unverified calls
8. Resend bounce forwarder (owner console step): in the Resend dashboard →
   Webhooks, add an endpoint `https://<your-app>/api/webhooks/resend`
   subscribed to **email.bounced, email.delivery_delayed, email.complained**,
   then copy the shown signing secret into `RESEND_WEBHOOK_SECRET` on Vercel.
   Until then, bounced pilot-request / hot-signal digest emails are only
   visible in the Resend console, not in-app
