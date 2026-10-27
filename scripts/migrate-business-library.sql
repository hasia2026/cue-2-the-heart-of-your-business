-- Compass business questionnaire → the Executive Library.
-- One row per (org, question): upserted answers live here so answered items
-- accumulate over time instead of one big blob being overwritten.
create table if not exists business_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  question text not null,
  answer text not null, -- may be "" when the owner cleared it
  updated_at timestamptz not null default now(),
  unique (organization_id, question)
);
create index if not exists business_library_org_idx on business_library(organization_id);
