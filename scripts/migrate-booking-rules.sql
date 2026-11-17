-- Booking Rules enforcement.
--
-- field_ops_rules used to be display-only preferences. These columns let the
-- scheduled confirmation runner remember when it last tried an automatic send
-- and why it could not send; booking_deposits is the gate for first-time
-- customer deposits.

alter table appointment_confirmations
  add column if not exists auto_send_attempted_at timestamptz;
alter table appointment_confirmations
  add column if not exists auto_send_error text;

create table if not exists booking_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  -- REQUESTED | PAID | WAIVED
  status text not null default 'REQUESTED',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  note text
);
create index if not exists booking_deposits_org_status_idx
  on booking_deposits(organization_id, status, requested_at desc);
