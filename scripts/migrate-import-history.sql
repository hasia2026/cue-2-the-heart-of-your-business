-- Import history: one row per committed spreadsheet import so an owner can see
-- what entered CUE, from which file, when and by whom. Written by the CSV
-- commit action (session context); import rows themselves stay in their
-- entity tables. Comments are full-line-only (run-sql splits on semicolons).
create table if not exists import_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  -- Denormalized display label — users rows get deleted, the log shouldn't.
  actor_name text,
  kind text not null,
  file_name text not null,
  row_count int not null default 0,
  imported int not null default 0,
  skipped int not null default 0,
  customers_created int not null default 0,
  -- Rows the user explicitly excluded in the preview step (distinct from
  -- rows that failed validation).
  excluded_user int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists import_history_org_created_idx
  on import_history(organization_id, created_at desc);
