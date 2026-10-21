-- Price-book assemblies + multi-labor-rate services — the HCP ask:
-- "build an assembly from multiple services and price labor per service at
-- standalone vs. add-on rates". One services entry per named work bundle,
-- one rate per service, and assembly items pointing back at them.
--
-- The org already has a price-book surface (vehicles cost/list for units,
-- Pricing Studio for labor math); these tables give the service side of the
-- book a real home without inventing a new page.
create table if not exists service_offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'SERVICE', -- SERVICE | PART | FEE
  description text,
  parts_cost numeric(12,2) not null default 0,
  -- standalone labor: what it costs the customer as its own job
  labor_rate_standalone numeric(12,2) not null default 0,
  labor_hours numeric(6,2) not null default 0,
  -- add-on labor: cheaper rate when bundled into a larger job
  labor_rate_addon numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_offerings_org_idx on service_offerings(organization_id);
create unique index if not exists service_offerings_org_name_idx
  on service_offerings(organization_id, name);

-- A named assembly of pre-built offerings — "New circuit" bundling "Add
-- breaker" + "Run wire" + "Cut in box". Lines point at offerings, so editing
-- the offering's rate updates future assemblies without re-copying numbers.
create table if not exists service_assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create unique index if not exists service_assemblies_org_name_idx
  on service_assemblies(organization_id, name);

create table if not exists service_assembly_items (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references service_assemblies(id) on delete cascade,
  offering_id uuid not null references service_offerings(id) on delete cascade,
  position int not null default 0,
  -- which labor rate this line prices at in THIS assembly
  pricing_mode text not null default 'STANDALONE' check (pricing_mode in ('STANDALONE','ADDON'))
);
create unique index if not exists service_assembly_items_unique
  on service_assembly_items(assembly_id, offering_id);
create index if not exists service_assembly_items_org_idx
  on service_assembly_items(assembly_id);
