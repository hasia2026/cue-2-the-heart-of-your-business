-- Academy track assignments + per-user lesson progress (replaces localStorage).
-- Idempotent; safe to re-run.

create table if not exists academy_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  track text not null,
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  unique (organization_id, user_id, track)
);
create index if not exists academy_assignments_org_idx on academy_assignments(organization_id);

create table if not exists academy_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  track text not null,
  lesson int not null check (lesson between 1 and 3),
  completed_at timestamptz not null default now(),
  unique (organization_id, user_id, track, lesson)
);
create index if not exists academy_progress_org_idx on academy_progress(organization_id);
