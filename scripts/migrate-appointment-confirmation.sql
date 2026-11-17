-- Explicit appointment confirmation records for Field Ops booking reviews.
--
-- `appointments.confirmed_at` remains for compatibility, but it is no longer
-- the source of truth. A row here is the durable record: PENDING (created,
-- no message yet), SENT (customer has the link), or CONFIRMED (staff or the
-- customer confirmed). The token is the customer-facing capability.
alter table appointments add column if not exists confirmed_at timestamptz;

create table if not exists appointment_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  -- PENDING | SENT | CONFIRMED
  status text not null default 'PENDING',
  -- LEGACY | STAFF | EMAIL | WHATSAPP | CUSTOMER_LINK | HOUSECALL_PRO
  method text,
  sent_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointment_confirmations_org_idx
  on appointment_confirmations(organization_id, confirmed_at);

insert into appointment_confirmations (organization_id, appointment_id, status, method, confirmed_at)
select a.organization_id, a.id,
  case when a.confirmed_at is not null then 'CONFIRMED' else 'PENDING' end,
  case when a.confirmed_at is not null then 'LEGACY' else null end,
  a.confirmed_at
from appointments a
on conflict (appointment_id) do nothing;
