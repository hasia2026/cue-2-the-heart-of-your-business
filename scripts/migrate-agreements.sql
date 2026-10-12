-- Maintenance agreements + customer quote language preference
-- (preferred_locale drives localized quotes). Comments are full-line-only
-- because scripts/run-sql.mjs splits on semicolons.
-- Preferred quote language per customer (en|es|ar|vi). NULL = org default.
alter table customers
  add column if not exists preferred_locale text;

create table if not exists maintenance_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  plan_name text not null default 'Standard maintenance plan',
  annual_value numeric(12,2) not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  -- ACTIVE | EXPIRED | CANCELLED
  status text not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists agreements_org_ends_idx on maintenance_agreements(organization_id, ends_at);
create unique index if not exists agreements_one_live_idx
  on maintenance_agreements(organization_id, customer_id) where (status = 'ACTIVE');
