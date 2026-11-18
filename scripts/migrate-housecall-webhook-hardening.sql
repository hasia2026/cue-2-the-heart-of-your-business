-- Housecall Pro webhook hardening: encrypted signing secret + raw event log.
--
-- The per-org URL token remains the routing/authentication fallback. When an
-- owner saves the signing secret Housecall Pro issues with the webhook, every
-- delivery must also pass Api-Timestamp/Api-Signature HMAC verification.
--
-- Every delivery is persisted before normalization so retries can be deduped,
-- failures can be inspected, and a failed/skipped event can be replayed without
-- asking Housecall Pro to resend it.
alter table integrations add column if not exists webhook_signing_secret_enc text;

create table if not exists housecall_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider_event_id text not null,
  event_name text,
  entity_type text,
  entity_external_id text,
  company_id text,
  event_occurred_at timestamptz,
  -- VERIFIED | INVALID | MISSING | NOT_CONFIGURED
  signature_status text not null default 'NOT_CONFIGURED',
  signature_verified boolean not null default false,
  -- RECEIVED | PROCESSING | PROCESSED | FAILED | SKIPPED | REJECTED
  status text not null default 'RECEIVED',
  attempts int not null default 0,
  last_error text,
  raw_body text not null,
  payload jsonb,
  headers jsonb not null default '{}'::jsonb,
  counts jsonb,
  reconciliation jsonb,
  received_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  processed_at timestamptz,
  replayed_at timestamptz,
  replayed_by uuid references users(id) on delete set null,
  unique (organization_id, provider_event_id)
);

create index if not exists housecall_webhook_events_org_time_idx
  on housecall_webhook_events(organization_id, received_at desc);
create index if not exists housecall_webhook_events_org_status_idx
  on housecall_webhook_events(organization_id, status, received_at desc);
