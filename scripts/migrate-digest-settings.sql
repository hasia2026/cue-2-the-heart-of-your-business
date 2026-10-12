-- Digest delivery settings + owner WhatsApp capture, per-org.
-- Kept on business_profiles (1:1 with orgs already) to avoid a new table:
-- digest_on / digest_day control the weekly email, whatsapp_number is the
-- owner's opt-in WhatsApp destination (E.164, entered during onboarding).
alter table business_profiles
  add column if not exists digest_on boolean not null default true,
  add column if not exists digest_day int not null default 1,      -- 0=Sun..6=Sat (cron-safe)
  add column if not exists whatsapp_number text;
