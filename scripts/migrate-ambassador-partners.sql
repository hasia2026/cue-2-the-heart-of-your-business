-- CUE migration: AI Ambassador config + partner program (idempotent)
alter table ai_settings
  add column if not exists ambassador_provider text,
  add column if not exists ambassador_model text,
  add column if not exists ambassador_key_enc text;

-- ───────── PARTNER PROGRAM ─────────
-- Partners share 50% of recurring revenue for as long as a referred org
-- stays subscribed. Refunds claw back the partner's share (payout_ledger
-- reversals). Stripe Connect destination charges split at purchase time.
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  code text unique not null,            -- short referral code, e.g. RVI-42X
  stripe_account_id text unique,        -- Stripe Connect express account
  stripe_onboarded boolean not null default false,
  commission_pct integer not null default 50,
  status text not null default 'ACTIVE',-- ACTIVE | PAUSED
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (organization_id)              -- first attribution wins
);
create index if not exists referrals_partner_idx on referrals(partner_id);

create table if not exists payout_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_amount_cents integer not null,
  commission_cents integer not null,
  kind text not null default 'COMMISSION', -- COMMISSION | REFUND_REVERSAL
  stripe_transfer_id text,
  status text not null default 'ACCRUED',  -- ACCRUED | PAID | REVERSED
  created_at timestamptz not null default now()
);
create index if not exists payout_ledger_partner_idx on payout_ledger(partner_id);

-- Referral attribution captured at signup
alter table organizations
  add column if not exists referred_by_code text;
