-- reading_assignments — the policy-update acknowledgment loop.
-- When a policy/SOP changes, managers assign affected staff a re-read; CUE
-- tracks outstanding vs acknowledged so nobody claims they were never told.
create table if not exists reading_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  status text not null default 'ASSIGNED', -- ASSIGNED | READ
  note text,
  assigned_by uuid references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  read_at timestamptz
);
create unique index if not exists reading_assignments_doc_emp_unique
  on reading_assignments(document_id, employee_id);
create index if not exists reading_assignments_org_status_idx
  on reading_assignments(organization_id, status);
