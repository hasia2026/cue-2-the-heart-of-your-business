-- market_signals: inbound market mentions (social listening webhooks + GBP sync).
-- Tenancy: organization_id on every row; app layer always filters by it.
-- Dedupe: signal_hash (sha256 of org+kind+source+author+title+body normalized,
-- or provider external id when given) enforced unique per org by a unique
-- index — replays and provider retries are no-ops.

create table if not exists market_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'SOCIAL',   -- SOCIAL | GBP
  source text not null default 'WEBHOOK',
  external_id text,
  author text,
  channel text,
  title text not null,
  body text,
  url text,
  intent text,                            -- BUY | SELL | SERVICE (classified on ingest)
  status text not null default 'NEW',     -- NEW | LEAD | INSIGHT | DISMISSED
  lead_id uuid references leads(id) on delete set null,
  insight_id uuid,
  signal_hash text not null,
  demo boolean not null default false,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  constraint market_signals_kind_chk check (kind in ('SOCIAL', 'GBP')),
  constraint market_signals_intent_chk check (intent in ('BUY', 'SELL', 'SERVICE')),
  constraint market_signals_status_chk check (status in ('NEW', 'LEAD', 'INSIGHT', 'DISMISSED'))
);

create index if not exists market_signals_org_idx on market_signals(organization_id);
create index if not exists market_signals_org_created_idx on market_signals(organization_id, created_at desc);
create index if not exists market_signals_lead_idx on market_signals(lead_id);
create unique index if not exists market_signals_org_dedupe_idx on market_signals(organization_id, signal_hash);
