-- Dealership intake state (per org): checklist progress and mock-exercise
-- completion live on business_profiles.intake_state. Comments are
-- full-line-only because scripts/run-sql.mjs splits on semicolons.
alter table business_profiles
  add column if not exists intake_state jsonb not null default '{}'::jsonb;
