-- Automated AR reminder cadence, per-org, owner-approved.
-- Kept on business_profiles (1:1 with orgs, same as the digest settings) so
-- no new table: reminders_on is OFF by default — nothing automates until the
-- owner turns it on (the approval). reminders_every_days is the cadence
-- interval; last_reminder_sent_at tracks due-ness for the daily cron.
alter table business_profiles
  add column if not exists reminders_on boolean not null default false,
  add column if not exists reminders_every_days int not null default 7,
  add column if not exists last_reminder_sent_at timestamptz;
