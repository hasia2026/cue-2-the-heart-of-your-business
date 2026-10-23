-- Lead alert retry queue + daily alert ledger, ONE table for both.
-- Every pilot-request notification attempt lives here: delivered quietly for
-- the daily summary, failed rows get exponential-backoff retries until
-- delivered (or 8 attempts ≈ one business day of trying).
-- Per schema rules: enforced state machine, partial index on only-undelivered
-- rows (the retry scan never touches delivered rows).
create table if not exists lead_alert_queue (
  id bigint generated always as identity primary key,
  channel text not null check (channel = 'EMAIL'),
  target text not null check (length(target) between 3 and 500),
  payload jsonb not null,
  attempts int not null default 0 check (attempts between 0 and 8),
  last_error text,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz
);

-- The ONLY hot path: undelivered rows due for a retry. Delivered rows never
-- enter this index, so the scan stays tiny forever.
create index if not exists lead_alert_queue_pending_idx
  on lead_alert_queue (next_attempt_at)
  where delivered_at is null;
