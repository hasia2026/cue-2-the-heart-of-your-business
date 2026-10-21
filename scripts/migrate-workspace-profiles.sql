-- Workspace Studio — one profile row per org: Ambassador persona, branding,
-- module toggles/labels, and guided-setup completion flags. Absent row =
-- stock behavior, so nothing breaks for existing orgs (lazy create on save).
-- Comments are full-line-only because scripts/run-sql.mjs splits on semicolons.

create table if not exists workspace_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  -- Ambassador persona (null = stock widget values)
  ambassador_name text,
  ambassador_avatar text,
  ambassador_tone text check (ambassador_tone in ('friendly','formal','concise','enthusiastic')),
  ambassador_greeting text,
  -- Branding (null = inherit org defaults)
  brand_name text,
  brand_logo_url text,
  brand_accent text,
  brand_contact_phone text,
  brand_contact_email text,
  theme_default text check (theme_default in ('system','light','dark')),
  -- Per-module state: { "pipeline": { "enabled": true, "label": "Deals" } }
  modules jsonb not null default '{}'::jsonb,
  -- Guided-setup progress: { "persona": true, "branding": true, "modules": true }
  setup_completed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
