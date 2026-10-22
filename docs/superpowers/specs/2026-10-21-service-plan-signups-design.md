# Service-plan sign-up links (approach A) — design spec

Date: 2026-10-21 · Status: awaiting user review
Origin: HCP customer request — "sign up links for service plans for email marketing".
Approved direction: **pending request model**, **new plan catalog**, CTA in **all branded emails** (quote + digest).

## Problem

The intelligence engine already flags repeat service buyers with no maintenance
agreement ("repeat service buyers pay call-by-call for breakdowns they could
lower-cost-prevent") and drafts renewal/priority outreach — but the outreach is
dead-end: every branded email says "Reply to accept" and nothing converts a click
into an agreement. This feature closes that loop first-party.

## Goals

1. A customer who receives a branded quote or digest email can click one button,
   pick a plan, submit their details — no app account, no phone call.
2. Every submission is traceable to the exact email (`?src=quote&q=<quoteId>` /
   `?src=digest&w=<week>`), and auto-matched to an existing customer when their
   email is known.
3. The owner reviews pending submissions and one-click converts one into a real
   `maintenance_agreements` row (still zero payments in the loop; operations
   decides billing as today).
4. Zero new third-party dependencies. All first-party data.

## Non-goals

- Payments / Stripe checkout of plans.
- Auto-creating ACTIVE agreements on submission (explicitly rejected).
- Leave-behind page placement and shareable-standalone-links (declined; revisit later).
- A separate newsletter product (CUE sends quotes + digests; if a newsletter
  surface ever exists it reuses the same helpers).

## 1. Data model (schema additions, migration: `scripts/migrate-plan-signups.sql`)

```sql
create table if not exists service_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  blurb text,
  annual_value numeric(12,2) not null default 0,
  visits_per_year int,
  featured boolean not null default false,
  active boolean not null default true,   -- shown on the public page
  position int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists service_plans_org_name_idx
  on service_plans(organization_id, name);
create index if not exists service_plans_org_active_idx
  on service_plans(organization_id, active, position);

create table if not exists plan_signups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid references service_plans(id) on delete set null,
  plan_name text not null,                 -- snapshot; survives plan deletion
  customer_id uuid references customers(id) on delete set null,
  customer_matched boolean not null default false,  -- true when email matched a known customer
  contact_name text not null,
  contact_email text,
  contact_phone text,
  address text,
  message text,
  -- QUOTE | DIGEST  (later surfaces use their own token)
  source text not null default 'LINK',
  source_ref text,                         -- quote id / digest week for attribution
  -- PENDING | CONVERTED | DISMISSED
  status text not null default 'PENDING',
  agreement_id uuid references maintenance_agreements(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null
);
create index if not exists plan_signups_org_status_idx
  on plan_signups(organization_id, status);
```

Constraints follow the existing patterns: UUID PKs, FK + cascade to the org, a
unique name per org, snapshot columns (`plan_name`) so deletes never orphan
history, status enum kept as CHECK-free text with app-side validation (matches
`maintenance_agreements.status` usage). Migration applied to the live DB via
`scripts/run-sql.mjs` before any code deploy, same as prior migrations.

## 2. Public sign-up page — `/plans/[orgId]` (root route group, no session)

- 404s unless the org exists; renders an honest "No plans published yet"
  empty state when the catalog is empty, so the page never lies.
- Branded card list using the same visual language and accent/logo as
  `renderQuoteHtml` (featured plans first). Plan card: name, blurb, "$X/yr",
  "N visits included", a Sign up button.
- The form (name required; email or phone required — both fields shown, one
  validated) posts a `planSignup` server action → row in `plan_signups`
  (PENDING). On success: confirmation view. Duplicate-open-email spam is
  capped with the existing `rate-limit` helper.
- Locale: link carries `&lang=` from the localized email; falls back `en`,
  matching `quoteLocale()` semantics (en/es/ar/vi only).
- Public server action mirrors the existing `/signup` pattern (progressive-
  enhancement form POST, no session requirement).

## 3. Email CTA links — builders only

`lib/plan-links.ts` (new):

```ts
export function baseAppUrl(): string       // APP_URL trimmed, else proto://host pattern from reset-actions.ts
export async function signupUrl(orgId, src: { source: "QUOTE"|"DIGEST"; ref?: string|null; locale?: string|null }): Promise<string>
```

- `renderQuoteHtml` / `renderQuoteText` gain an optional `plansUrl` param; when
  set, a branded accent button ("Sign up for a maintenance plan →", per-locale
  strings in the existing `L` dict) is appended below the "accept" block, and
  the text version gets a plain URL line.
- Digest: the send path (`/api/digest/send`) passes `signupUrl(...src=DIGEST,
  ref=<week>)` the same way. Builders stay pure; senders resolve the URL.
- Dev-verified against APP_URL=http://localhost:3210; on Vercel APP_URL is set.

## 4. Workspace UI — Enhance module ("Service plans" section, next to Brand Studio)

- **Catalog editor** (owner/admin/manager only — same role gate as
  PriceBookClient): add/rename plans, blurb, annual value, visits/yr, featured
  toggle, active toggle. Edits save immediately (server action + audit).
- **"Get sign-up links" card:** copyable plain page link plus a per-locale
  preview dropdown; the same helper drives email CTAs, so what owners copy is
  what emails embed.
- **Submissions list:** PENDING first, then decided. Each pending row shows
  source badge (QUOTE q-id / DIGEST week), matched customer chip when known,
  and two actions: **Create agreement** / **Dismiss**.
- **Create agreement** (server action, one click, no extra form): match-or-create
  customer by email → insert `maintenance_agreements` (plan name, annual value,
  starts now, ACTIVE) → mark signup CONVERTED (agreement_id, decided_at/by) →
  audit event `PLAN_SIGNUP_CONVERTED`. Respects the unique one-live-agreement
  index: converting into an org where the customer already has a live agreement
  returns an honest inline error instead of 500.
- Automation: explicitly none in this spec — conversion is owner-triggered
  one-click only. A future automation wave can pre-suggest conversions, but
  that goes through the existing AI-ladder approval flow, not this feature.

## 5. Error handling & security

- Public action validates org + plan ids belong together, required fields,
  email format, and rate-limits per IP; nothing echoes the full DB.
- Every workspace mutation goes through `requireSessionAction` and logs
  `logAudit` (PLAN_CREATED / PLAN_UPDATED / SIGNUP_SUBMITTED / SIGNUP_CONVERTED /
  SIGNUP_DISMISSED).
- Public page and form render no owner PII beyond what emails already carried.

## 6. Testing & verification

1. `npm run typecheck` + production build.
2. New `scripts/verify-plan-signups.mjs`: seeds a plan, POSTs the public form
   twice (rate-limit check), asserts pending row + correct source_ref in the DB
   probe, exercises convert → agreement created + signup CONVERTED.
3. e2e suite re-run; manual pass: render /plans page (branded), inspect the CTA
   inside a real quote + digest preview build, convert a fixture signup.
4. Migration applied to live DB before deploy (run-sql receipt).

## Files touched

New: `lib/plan-links.ts`, `app/plans/[orgId]/page.tsx`(+`actions.ts`),
`app/(app)/enhance/ServicePlans*.tsx`, `scripts/migrate-plan-signups.sql`,
`scripts/verify-plan-signups.mjs`, locales entries.
Modified: `lib/quote.ts` (CTA + optional plansUrl), digest send route,
`app/(app)/enhance/page.tsx`, product tour + GTM tour copy.
