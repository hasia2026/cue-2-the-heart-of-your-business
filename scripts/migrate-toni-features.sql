-- Pilot-feedback build (Toni Stone round):
--   1. quote_responses: a sent quote becomes a real record with a secret
--      token, so the email can carry per-option ACCEPT/DECLINE links and the
--      customer's reply lands back in CUE — no login for the customer.
--   2. business_profiles.timezone: the org's IANA timezone anchors every
--      scheduled time and the calendar feed, regardless of where the owner
--      happens to be standing (travel, phone tz).
--   3. business_profiles.calendar_token: the private subscribe URL for the
--      .ics feed (calendar apps cannot sign in, so the token is the auth).
--   4. ReferPro integration row: registered as AVAILABLE — wiring exists,
--      activation needs their paid account (no free tier).

alter table business_profiles add column if not exists timezone text;
alter table business_profiles add column if not exists calendar_token uuid;

create table if not exists quote_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  token uuid not null,
  title text not null,
  options jsonb not null default '[]',
  locale text,
  decided text,
  decided_at timestamptz,
  response_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists quote_responses_token_idx on quote_responses(token);
create index if not exists quote_responses_org_idx on quote_responses(organization_id, created_at desc);

-- Safety net: the app always supplies the token itself, but a DB default
-- makes an accidental null insert impossible.
alter table quote_responses alter column token set default gen_random_uuid();

alter table integrations add column if not exists webhook_secret text;

insert into integrations (organization_id, key, name, category, status, data_available, capabilities, webhook_secret)
select o.id, 'referpro', 'ReferPro (referral AI for the trades)', 'MARKETING', 'AVAILABLE',
       'Referral leads, attribution, payouts',
       'Webhook ingest is wired: referral leads land in Pipeline tagged REFER the moment a paid ReferPro account posts campaign events. Two-way sync + instant payouts activate when the paid account is funded',
       gen_random_uuid()::text
from organizations o
where not exists (
  select 1 from integrations i where i.organization_id = o.id and i.key = 'referpro'
);
-- backfill for rows created before this column existed
update integrations
set webhook_secret = gen_random_uuid()::text
where key = 'referpro' and webhook_secret is null;
