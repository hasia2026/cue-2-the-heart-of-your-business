-- Lightweight uptime/error monitoring for CUE (2026-10-13).
-- Idempotent; safe to re-run.

-- Deduped server/client error events. Recurring errors (same message+digest)
-- update last_seen_at and bump occurrences instead of spamming rows.
create table if not exists error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,          -- sha256(message + ':' + digest)
  message text not null,
  digest text,
  path text,
  method text,
  route_path text,
  route_type text,                    -- render | route | action | middleware | client
  source text not null default 'SERVER',  -- SERVER | CLIENT
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists error_events_fingerprint_idx on error_events(fingerprint);
create index if not exists error_events_last_seen_idx on error_events(last_seen_at desc);

-- Daily heartbeat history from the cron ping.
create table if not exists monitor_heartbeats (
  id uuid primary key default gen_random_uuid(),
  ok boolean not null,
  db_up boolean not null,
  detail text,
  new_errors int not null default 0,
  alerted boolean not null default false,
  checked_at timestamptz not null default now()
);
create index if not exists monitor_heartbeats_checked_idx on monitor_heartbeats(checked_at desc);
