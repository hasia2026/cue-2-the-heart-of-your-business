-- employee_shifts — the weekly roster dealership managers edit themselves.
-- Weekly template by day-of-week, not per-date rows: a pilot store changes
-- the standing week far more often than any single day, and zero-date logic
-- keeps the grid renderable server-side with no aggregate window.
-- day_of_week is Postgres convention: 0 = Sunday … 6 = Saturday.
create table if not exists employee_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  shift text not null check (shift in ('AM', 'PM', 'DOUBLE', 'OFF'))
);
create unique index if not exists employee_shifts_unique
  on employee_shifts(employee_id, day_of_week);
create index if not exists employee_shifts_org_idx
  on employee_shifts(organization_id, day_of_week);
