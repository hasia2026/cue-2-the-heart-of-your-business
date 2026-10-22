-- Ambassador avatar photo upload (mirrors the workspace_logos pattern:
-- bytes per org, served via /api/workspace/avatar/[orgId]; the URL column
-- lets every persona consumer show photo-over-emoji). Comments are
-- full-line-only because scripts/run-sql.mjs splits on semicolons.

create table if not exists workspace_avatars (
  organization_id uuid primary key references organizations(id) on delete cascade,
  mime text not null,
  data bytea not null,
  updated_at timestamptz not null default now()
);

alter table workspace_profiles
  add column if not exists ambassador_avatar_url text;
