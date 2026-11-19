-- 24-hour confirmation retries.
--
-- The cadence makes at most three automatic attempts per visit, six hours
-- apart, and records each claim atomically so overlapping cron runs cannot
-- double-send. Existing rows that already attempted once start at 1.
alter table appointment_confirmations
  add column if not exists auto_send_attempts int not null default 0;

update appointment_confirmations
set auto_send_attempts = 1
where auto_send_attempted_at is not null and auto_send_attempts = 0;
