-- Housecall Pro appointment sync.
--
-- Appointments live only under a job in the public API. Store their external
-- identity and job link so repeated syncs update the same row. Confirmation
-- state is only applied when Housecall Pro supplies an explicit confirmation
-- signal; a scheduled job is not treated as confirmed.
alter table appointments add column if not exists external_source text;
alter table appointments add column if not exists external_id text;
alter table appointments add column if not exists external_job_id text;
alter table appointments add column if not exists service_order_id uuid references service_orders(id) on delete set null;
alter table appointments add column if not exists ends_at timestamptz;
alter table appointments add column if not exists arrival_window_minutes integer;
alter table appointments add column if not exists external_confirmation_status text;
alter table appointments add column if not exists external_confirmed_at timestamptz;
alter table appointments add column if not exists last_synced_at timestamptz;

create unique index if not exists appointments_org_external_idx
  on appointments (organization_id, external_source, external_id) where external_id is not null;
create index if not exists appointments_service_order_idx
  on appointments (service_order_id);
