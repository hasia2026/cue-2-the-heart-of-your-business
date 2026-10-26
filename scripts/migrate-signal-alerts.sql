-- signal_alert_ledger: what hot-signal alerts actually did — one row per
-- owner notification about hot signals (email and batched Web Push whisper).
-- The Signals page reads the last rows for "Recent owner alerts"; anything
-- FAILED/SKIPPED here is the in-app trace paired with bounce events on /monitor.
create table if not exists signal_alert_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  signal_id uuid references market_signals(id) on delete set null,
  kind text not null check (kind in ('EMAIL', 'PUSH')),
  intent text check (intent in ('BUY', 'SELL', 'SERVICE')),
  subject text not null,
  status text not null check (status in ('SENT', 'FAILED', 'SKIPPED')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists signal_alert_ledger_org_created_idx
  on signal_alert_ledger (organization_id, created_at desc);
