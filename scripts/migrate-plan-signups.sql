-- Service-plan catalog + public plan sign-ups (approach A, spec:
-- docs/superpowers/specs/2026-10-21-service-plan-signups-design.md).
-- service_plans = owner-curated catalog shown on the public /plans page;
-- plan_signups = pending customer requests, converted one-click into
-- maintenance_agreements. source/source_ref attribute each submission to the
-- email surface that carried the link. Comments are full-line-only because
-- scripts/run-sql.mjs splits on semicolons.

create table if not exists service_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  blurb text,
  annual_value numeric(12,2) not null default 0,
  visits_per_year int,
  featured boolean not null default false,
  active boolean not null default true,
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
  plan_name text not null,
  customer_id uuid references customers(id) on delete set null,
  customer_matched boolean not null default false,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  address text,
  message text,
  source text not null default 'LINK',
  source_ref text,
  status text not null default 'PENDING',
  agreement_id uuid references maintenance_agreements(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null
);
create index if not exists plan_signups_org_status_idx
  on plan_signups(organization_id, status, submitted_at desc);
-- FK columns Postgres does not auto-index (skill: schema-foreign-key-indexes)
create index if not exists plan_signups_plan_idx on plan_signups(plan_id);
create index if not exists plan_signups_customer_idx on plan_signups(customer_id);
create index if not exists plan_signups_agreement_idx on plan_signups(agreement_id);
create index if not exists plan_signups_decided_by_idx on plan_signups(decided_by);
create index if not exists plan_signups_source_idx on plan_signups(organization_id, source);
