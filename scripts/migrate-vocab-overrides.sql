-- Per-org vocabulary overrides (white-labeling).
-- business_profiles.label_overrides holds a jsonb map of Vocab keys → strings;
-- missing keys fall through to the org's industry pack (src/lib/vocab.ts).
-- Idempotent; safe to re-run.

alter table business_profiles add column if not exists label_overrides jsonb not null default '{}'::jsonb;
