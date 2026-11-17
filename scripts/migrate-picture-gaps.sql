-- Picture-gap modules: projects (Execute), project task links, and reviews.
-- Idempotent — db-setup.mjs applies every migrate-*.sql patch on rebuild.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'ACTIVE', -- ACTIVE | COMPLETED
  due_at timestamptz
);
create index if not exists projects_org_idx on projects(organization_id);

alter table tasks add column if not exists project_id uuid references projects(id) on delete cascade;
alter table tasks add column if not exists due_at timestamptz;
create index if not exists tasks_project_idx on tasks(project_id);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  rating int check (rating between 1 and 5),
  channel text not null default 'GOOGLE', -- GOOGLE | SMS | EMAIL | IN_PERSON
  comment text,
  status text not null default 'REQUESTED', -- REQUESTED | RECEIVED | DISMISSED
  requested_at timestamptz not null default now(),
  received_at timestamptz
);
create index if not exists reviews_org_idx on reviews(organization_id);
