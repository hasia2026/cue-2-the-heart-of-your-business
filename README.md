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
npm run db:setup            # applies scripts/schema.sql (33 tables)
npm run db:seed             # Northgate Auto Group — auto dealership demo
npm run dev                 # http://localhost:3210
```

**Pilot demo login** (after seeding):
- Email: `demo@northgate.example`
- Password: `cue-demo-2026`

The demo org ships with real business problems CUE detects: 7 unbilled completed service
orders, 14 stale leads, 5 vehicles past the 60-day aging threshold, deals stuck in finance,
and overdue invoices — each with evidence, a recommendation, and an approval path.

## Scripts

| Command | What it does |
|---|---|
| `npm run db:setup` | Applies `scripts/schema.sql` (add `--fresh` to reset) |
| `npm run db:seed` | Seeds the auto-dealership demo org |
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
