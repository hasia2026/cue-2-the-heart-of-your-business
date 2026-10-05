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
- [x] Typecheck clean · production build passes · 17/17 smoke checks green

## 🔒 Before first real customer
- [ ] Rotate Supabase DB password (owner committed to this) + create least-privilege app role
- [ ] Generate a fresh `CUE_SESSION_SECRET` for production (never reuse dev)
- [ ] Enable Supabase PITR / scheduled backups
- [ ] Wire password-reset email (Resend or SMTP) — schema + tokens already exist
- [ ] Rate-limit `/api/assistant` + auth actions for public exposure
- [ ] Decide RLS posture (app-layer isolation now; optional Supabase Auth + RLS later)

## 🚀 Pilot hardening (first 5 dealerships)
- [ ] Replace seeded demo evidence refs with live DMS export (CSV ingest in Capture)
- [ ] Add employee invite flow (Settings → Team)
- [ ] Document real DMS integration: field mapping from CDK/Dealertrack exports
- [ ] Weekly digest email (open insights + pending decisions)
- [ ] Uptime monitoring on `/api/health` (Better Stack / Vercel checks)

## 🏭 Scale phase
- [ ] Move detectors to a scheduled job (Vercel Cron) with per-org fan-out
- [ ] Vector search for Knowledge (Supabase pgvector) to upgrade assistant retrieval
- [ ] Usage metering for pricing tiers (per-seat + per-connection)
- [ ] SOC 2 track: audit log retention policy, access reviews, incident runbook
