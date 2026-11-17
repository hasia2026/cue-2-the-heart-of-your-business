-- Field Ops + field-service connector layer.
--
-- CUE stays the intelligence/recovery layer above dispatch. Housecall Pro is
-- the first fully wired connector: API-key pull sync for customers/jobs/
-- invoices, plus a per-org webhook for live job/customer/invoice events.
-- ServiceTitan and Jobber rows are registered as AVAILABLE so the connector
-- surface is provider-agnostic from day one.

alter table integrations add column if not exists api_key_enc text;
alter table integrations add column if not exists account_name text;

-- External identity on canonical records: a re-sync updates the same row
-- instead of duplicating the customer/job/invoice. Partial unique indexes let
-- locally created rows keep external_id = null.
alter table customers add column if not exists external_source text;
alter table customers add column if not exists external_id text;
create unique index if not exists customers_org_external_idx
  on customers (organization_id, external_source, external_id) where external_id is not null;

alter table service_orders add column if not exists external_source text;
alter table service_orders add column if not exists external_id text;
create unique index if not exists service_orders_org_external_idx
  on service_orders (organization_id, external_source, external_id) where external_id is not null;

alter table invoices add column if not exists external_source text;
alter table invoices add column if not exists external_id text;
create unique index if not exists invoices_org_external_idx
  on invoices (organization_id, external_source, external_id) where external_id is not null;

-- Booking rules the owner can turn on/off. Defaults live in code; rows only
-- exist once an owner changes one.
create table if not exists field_ops_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default true,
  threshold numeric(10,2),
  updated_at timestamptz not null default now(),
  unique (organization_id, rule_key)
);

insert into integrations (organization_id, key, name, category, status, data_available, capabilities, webhook_secret)
select o.id, 'housecall_pro', 'Housecall Pro', 'FIELD_SERVICE', 'AVAILABLE',
       'Customers, jobs, schedules, invoices, job statuses',
       'API-key pull sync for customers, jobs, appointments and invoices, plus a per-org webhook for customer/job/appointment/invoice events. CUE layers Field Ops, leak detection and recovery on top — it does not replace dispatch.',
       gen_random_uuid()::text
from organizations o
where not exists (
  select 1 from integrations i where i.organization_id = o.id and i.key = 'housecall_pro'
);

insert into integrations (organization_id, key, name, category, status, data_available, capabilities, webhook_secret)
select o.id, 'servicetitan', 'ServiceTitan', 'FIELD_SERVICE', 'AVAILABLE',
       'Customers, jobs, appointments, invoices',
       'Connector slot reserved with the same canonical mapping as Housecall Pro. Add credentials to activate pull sync.',
       gen_random_uuid()::text
from organizations o
where not exists (
  select 1 from integrations i where i.organization_id = o.id and i.key = 'servicetitan'
);

insert into integrations (organization_id, key, name, category, status, data_available, capabilities, webhook_secret)
select o.id, 'jobber', 'Jobber', 'FIELD_SERVICE', 'AVAILABLE',
       'Clients, jobs, visits, invoices',
       'Connector slot reserved with the same canonical mapping as Housecall Pro. Add credentials to activate pull sync.',
       gen_random_uuid()::text
from organizations o
where not exists (
  select 1 from integrations i where i.organization_id = o.id and i.key = 'jobber'
);

update integrations
set webhook_secret = gen_random_uuid()::text
where key in ('housecall_pro', 'servicetitan', 'jobber') and webhook_secret is null;

-- Backfill the integration badge for orgs that already have synced records.
update integrations i
set status = 'CONNECTED'
where i.key = 'housecall_pro'
  and exists (
    select 1 from customers c
    where c.organization_id = i.organization_id and c.external_source = 'housecall_pro'
  );