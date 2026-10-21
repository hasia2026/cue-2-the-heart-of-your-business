-- Workspace Studio logo upload — one image row per org, stored as bytea.
-- Served publicly via /api/workspace/logo/[orgId] (a logo is not sensitive;
-- external email clients must be able to load it without a session).
-- Comments are full-line-only because scripts/run-sql.mjs splits on semicolons.
create table if not exists workspace_logos (
  organization_id uuid primary key references organizations(id) on delete cascade,
  mime text not null,
  data bytea not null,
  updated_at timestamptz not null default now()
);
