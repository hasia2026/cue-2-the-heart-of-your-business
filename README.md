# CUE — The Heart of Your Business

**CUE is an AI Business Operating System** for small and growing businesses.
It connects the people, knowledge, workflows, and systems that keep a business moving:

**Capture → Understand → Enhance → Execute → Expand**

- Every insight is **computed from actual records** — never fabricated
- Every recommendation carries **evidence, reasoning, confidence** and a full **audit trail**
- Consequential actions are **never automatic**: Approve / Reject / Modify / Defer, then generate workflows
- **Industry Packs** adapt one core to many businesses — **Auto Dealership** ships first
- **Multilingual**: English · Español · Tiếng Việt · العربية (full RTL)

## Stack (v2 — no ORM)

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind 3 |
| Database | **Supabase Postgres** — raw parameterized SQL via `postgres.js` (no Prisma, no ORM) |
| Auth | First-party: scrypt password hashing + HMAC-signed httpOnly session cookie |
| Hosting | Vercel (pooled Supabase connection, `prepare: false`) |
| Secrets | `.env` only — never committed |

## Quick start

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL + CUE_SESSION_SECRET
npm run db:setup            # applies scripts/schema.sql + every migrate-*.sql
npm run db:seed             # Northgate Auto Group — auto dealership demo
npm run dev                 # http://localhost:3210
```

**Demo logins** (after seeding — all accounts have working passwords):

| Org | Role | Email | Password |
|---|---|---|---|
| Northgate Auto Group | OWNER | `demo@northgate.example` | `northgate-demo-2026` |
| Northgate Auto Group | ADMIN | `marcus@northgate.example` | `northgate-demo-2026` |
| Northgate Auto Group | MANAGER | `rachel@northgate.example` | `northgate-mgr-2026` |
| Northgate Auto Group | MEMBER | `tom@northgate.example` | `northgate-staff-2026` |
| Summit Air Heating & Cooling | OWNER | `demo@summitair.example` | `summit-demo-2026` |
| Summit Air Heating & Cooling | ADMIN | `rita@summitair.example` | `summit-admin-2026` |
| Summit Air Heating & Cooling | MANAGER | `sam@summitair.example` | `summit-mgr-2026` |
| Summit Air Heating & Cooling | MEMBER | `chris@summitair.example` | `summit-staff-2026` |
| Lotus Nail Studio (salon, Garden Grove) | OWNER | `demo@lotusnails.example` | `lotus-demo-2026` |
| Lotus Nail Studio (salon, Garden Grove) | ADMIN | `mai@lotusnails.example` | `lotus-admin-2026` |
| Lotus Nail Studio (salon, Garden Grove) | MANAGER | `kim@lotusnails.example` | `lotus-mgr-2026` |
| Lotus Nail Studio (salon, Garden Grove) | MEMBER | `vy@lotusnails.example` | `lotus-staff-2026` |
| Harbor Auto Repair (independent shop, Costa Mesa) | OWNER | `demo@harborauto.example` | `harbor-demo-2026` |
| Harbor Auto Repair (independent shop, Costa Mesa) | ADMIN | `nina@harborauto.example` | `harbor-admin-2026` |
| Harbor Auto Repair (independent shop, Costa Mesa) | MANAGER | `ray@harborauto.example` | `harbor-mgr-2026` |
| Harbor Auto Repair (independent shop, Costa Mesa) | MEMBER | `tomas@harborauto.example` | `harbor-staff-2026` |

`.example` addresses cannot receive mail — reset demo passwords with
`node --env-file=.env scripts/rotate-demo-passwords.mjs` instead of the
forgot-password flow.

The demo org ships with real business problems CUE detects: 7 unbilled completed service
orders, 14 stale leads, 5 vehicles past the 60-day aging threshold, deals stuck in finance,
and overdue invoices — each with evidence, a recommendation, and an approval path.

A third pack seeds a Vietnamese-owned nail salon in Garden Grove (Orange County) with
salon vocabulary, a retail shelf, and clients who prefer Vietnamese or Spanish:
`npm run db:seed:salon`.

A fourth pack seeds an independent auto-repair shop in Costa Mesa with repair-order
language, a parts-and-labor menu, and service enquiries that go stale:
`npm run db:seed:auto-repair`.

Set `MIGRATION_DATABASE_URL` to the direct or session-mode (5432) database URL;
`db:setup` and `run-sql` reject the pooled 6543 URL. A non-local `--fresh` reset
requires `--confirm-fresh`.

**Existing databases:** `db:setup` applies the Field Ops/Housecall Pro migrations
on a fresh setup. Before enabling Field Ops on an older database, run
`scripts/migrate-field-ops-housecall.sql`,
`scripts/migrate-appointment-confirmation.sql` (explicit confirmation records
plus customer `/confirm/<token>` links), and
`scripts/migrate-housecall-appointments.sql` (appointment external IDs, job
linkage, timing fields), then verify with
`scripts/verify-field-ops-schema.sql` — see DEPLOY.md and PRODUCTION-CHECKLIST.md.

## Scripts

| Command | What it does |
|---|---|
| `npm run db:setup` | Applies `scripts/schema.sql` and every `scripts/migrate-*.sql` patch, including Field Ops/Housecall Pro (add `--fresh` to reset; non-local resets also need `--confirm-fresh`) |
| `npm run db:seed` | Seeds the auto-dealership demo org |
| `npm run db:seed:salon` | Seeds the nail-salon demo org (Lotus Nail Studio, Orange County) |
| `npm run db:seed:auto-repair` | Seeds the independent auto-repair demo org (Harbor Auto Repair, Costa Mesa) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |
| `node --env-file=.env scripts/smoke-auth.mjs` | E2E smoke test (17 checks) |
| `npx tsx --env-file=.env scripts/wf-test.ts` | Rec → workflow → tasks service test |

## Architecture map

```
src/
  app/
    (app)/            authenticated shell: dashboard, compass, capture, understand,
                      knowledge, pipeline, execute, people, expand, enhance, lab,
                      ecosystem, signals, settings
    api/              assistant · decision · insight · locale · health
    signin|signup     auth pages + server actions
  components/         AppShell, NavClient, CueAI drawer, EvidenceDrawer, LanguageSwitcher
  lib/
    db.ts             postgres.js singleton (pooled-safe)
    auth.ts           scrypt + HMAC session (no deps)
    intelligence.ts   deterministic detectors → insights + recs (evidence-first)
    health.ts         explainable Business Health score
    workflows.ts      approved rec → workflow + record-level tasks
    assistant.ts      grounded CUE AI (answers from real data, admits unknowns)
    i18n.ts           EN/ES/VI/AR dictionaries + RTL
scripts/
  schema.sql          single source of truth (33 tables, org-scoped)
  seed-dealership.mjs industry-pack demo
```

## Product principles (enforced in code)

1. **Evidence-first** — `insights.evidence` is a jsonb ref list; the UI always shows
   Score → Evidence → Reasoning → Confidence → Recommendation.
2. **Human control** — approvals are explicit; workflows only generate from approved recs;
   AI permission levels (Observe/Recommend/Prepare/Execute/Automate) are configurable in Settings.
3. **Organization isolation** — every query filters by `organization_id` from the signed session.
4. **Auditability** — every consequential event lands in `audit_events`.
5. **Honest integrations** — demo sources are labeled DEMO; nothing pretends to be live.
