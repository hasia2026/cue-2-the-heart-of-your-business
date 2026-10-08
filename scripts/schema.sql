-- CUE v2 schema — Supabase Postgres. No ORM. Applied by scripts/db-setup.mjs.
-- Tenancy: every business table carries organization_id; app layer always filters by it.

create extension if not exists pgcrypto;

-- ───────── IDENTITY ─────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  password_changed_at timestamptz
);

-- ───────── ORGANIZATION ─────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'MEMBER', -- OWNER | ADMIN | MANAGER | MEMBER
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists members_user_idx on members(user_id);

create table if not exists business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references organizations(id) on delete cascade,
  name text not null,
  industry text,
  size text,
  locations text,
  business_model text,
  offerings text,
  target_customers text,
  mission text,
  values_text text,
  operational_priorities text,
  onboarding_step int not null default 10,
  locale text not null default 'en'
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references business_profiles(id) on delete cascade,
  title text not null,
  detail text,
  horizon text, -- QUARTER | YEAR | LONG
  status text not null default 'ACTIVE'
);

-- ───────── BUSINESS DATA (shared core) ─────────
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  type text not null default 'RETAIL', -- dealership: RETAIL | WHOLESALE | FLEET
  status text not null default 'ACTIVE',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_org_idx on customers(organization_id);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  title text not null,
  department_id uuid,
  manager_id uuid,
  email text,
  skills text,
  responsibilities text,
  status text not null default 'ACTIVE',
  hire_date date
);
create index if not exists employees_org_idx on employees(organization_id);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text
);
create index if not exists departments_org_idx on departments(organization_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employees_dept_fk') then
    alter table employees add constraint employees_dept_fk foreign key (department_id) references departments(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_mgr_fk') then
    alter table employees add constraint employees_mgr_fk foreign key (manager_id) references employees(id);
  end if;
end $$;

-- ───────── INDUSTRY PACK: AUTO DEALERSHIP ─────────
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stock_number text not null,
  vin text,
  year int not null,
  make text not null,
  model text not null,
  trim text,
  kind text not null default 'USED', -- NEW | USED
  status text not null default 'AVAILABLE', -- IN_TRANSIT | AVAILABLE | RESERVED | SOLD
  list_price numeric(12,2),
  cost numeric(12,2),
  listed_at timestamptz,
  sold_at timestamptz
);
create index if not exists vehicles_org_idx on vehicles(organization_id);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  vehicle_id uuid references vehicles(id),
  deal_type text not null default 'USED', -- NEW | USED
  status text not null default 'NEGOTIATING', -- NEGOTIATING | PENDING_FINANCE | WON | LOST
  amount numeric(12,2) not null default 0,
  finance_sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deals_org_idx on deals(organization_id);

create table if not exists service_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  vehicle_id uuid references vehicles(id),
  title text not null,
  status text not null default 'OPEN', -- OPEN | IN_PROGRESS | AWAITING_PARTS | COMPLETED
  amount numeric(12,2) not null default 0,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  invoiced_at timestamptz
);
create index if not exists service_orders_org_idx on service_orders(organization_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  source text not null default 'WEB', -- WEB | PHONE | WALK_IN | REFERRAL | MARKET | GBP | CSV
  interest text,
  est_value numeric(12,2),
  status text not null default 'NEW', -- NEW | CONTACTED | QUALIFIED | WON | LOST
  assigned_to_id uuid references employees(id),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now(),
  last_contact_at timestamptz
);
create index if not exists leads_org_idx on leads(organization_id);

-- ───────── TRANSACTIONS ─────────
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  deal_id uuid references deals(id),
  service_order_id uuid references service_orders(id),
  number text not null,
  kind text not null default 'DEAL', -- DEAL | SERVICE | PARTS
  amount numeric(12,2) not null default 0,
  status text not null default 'SENT', -- DRAFT | SENT | PAID | OVERDUE | VOID
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz
);
create index if not exists invoices_org_idx on invoices(organization_id);

-- generic line items for invoices (dealership menus, parts, labor)
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null default 0
);
create index if not exists invoice_items_inv_idx on invoice_items(invoice_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  invoice_id uuid references invoices(id),
  amount numeric(12,2) not null default 0,
  method text not null default 'CARD',
  received_at timestamptz not null default now()
);
create index if not exists payments_org_idx on payments(organization_id);

create table if not exists communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  channel text not null default 'PHONE', -- EMAIL | PHONE | SMS | IN_PERSON
  direction text not null default 'OUTBOUND',
  summary text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists communications_org_idx on communications(organization_id);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id),
  title text not null,
  kind text not null default 'SERVICE', -- TEST_DRIVE | SERVICE | DELIVERY | MEETING
  scheduled_for timestamptz not null,
  status text not null default 'SCHEDULED', -- SCHEDULED | COMPLETED | NO_SHOW | CANCELLED
  notes text
);
create index if not exists appointments_org_idx on appointments(organization_id);

-- ───────── KNOWLEDGE ─────────
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  kind text not null default 'OTHER', -- POLICY | PROCEDURE | CONTRACT | RECORD | NOTE | SPREADSHEET | MEDIA | OTHER
  department_id uuid references departments(id),
  status text not null default 'PROCESSED', -- UPLOADED | PROCESSING | PROCESSED | FAILED
  extracted_text text,
  uploaded_at timestamptz not null default now(),
  source text not null default 'UPLOAD'
);
create index if not exists documents_org_idx on documents(organization_id);

create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  title text not null,
  content text not null,
  category text not null, -- POLICY | PROCEDURE | DECISION | LESSON | CUSTOMER | PRODUCT | HISTORY | STRATEGY
  tags text,
  status text not null default 'FACT', -- FACT | ASSUMPTION | RECOMMENDATION | DECISION
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists knowledge_org_idx on knowledge_items(organization_id);

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null, -- CUSTOMER | EMPLOYEE | PRODUCT | DEPARTMENT | POLICY | PROCESS | RISK | OPPORTUNITY
  name text not null,
  description text
);
create index if not exists entities_org_idx on entities(organization_id);

create table if not exists facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  statement text not null,
  document_id uuid references documents(id) on delete set null,
  confidence numeric(3,2) not null default 0.90,
  status text not null default 'FACT',
  created_at timestamptz not null default now()
);
create index if not exists facts_org_idx on facts(organization_id);

-- ───────── INTELLIGENCE ─────────
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null, -- RISK | OPPORTUNITY | REVENUE | OPERATIONS | CUSTOMER | ANOMALY
  title text not null,
  summary text not null,
  severity text not null default 'MEDIUM', -- HIGH | MEDIUM | LOW
  impact_value numeric(12,2),
  evidence jsonb not null default '[]'::jsonb,
  reasoning text not null,
  confidence numeric(3,2) not null default 0.80,
  status text not null default 'OPEN', -- OPEN | ACTION_TAKEN | DISMISSED | RESOLVED
  rec_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists insights_org_idx on insights(organization_id);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  insight_id uuid references insights(id) on delete set null,
  title text not null,
  action text not null,
  rationale text not null,
  impact text,
  impact_value numeric(12,2),
  confidence numeric(3,2) not null default 0.80,
  status text not null default 'PENDING', -- PENDING | APPROVED | REJECTED | MODIFIED | DEFERRED | EXECUTED
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id),
  workflow_id uuid
);
create index if not exists recs_org_idx on recommendations(organization_id);

-- ───────── EXECUTION ─────────
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rec_id uuid unique references recommendations(id) on delete set null,
  title text not null,
  description text,
  kind text not null default 'FOLLOW_UP', -- FOLLOW_UP | BILLING | PROCESS | TRAINING | CUSTOM
  status text not null default 'ACTIVE',
  source text not null default 'AI_RECOMMENDATION',
  created_at timestamptz not null default now()
);
create index if not exists workflows_org_idx on workflows(organization_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recs_workflow_fk') then
    alter table recommendations add constraint recs_workflow_fk foreign key (workflow_id) references workflows(id);
  end if;
end $$;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'ACTIVE',
  due_at timestamptz
);
create index if not exists projects_org_idx on projects(organization_id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workflow_id uuid references workflows(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  detail text,
  status text not null default 'OPEN', -- OPEN | IN_PROGRESS | DONE | CANCELLED
  priority text not null default 'MEDIUM',
  due_at timestamptz,
  assignee_id uuid references employees(id),
  customer_id uuid references customers(id),
  origin text not null default 'MANUAL',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_org_idx on tasks(organization_id);

-- ───────── EXPAND / ENHANCE / LAB ─────────
create table if not exists training_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  summary text not null,
  category text not null, -- ONBOARDING | SAFETY | PRODUCT | PROCESS | CUSTOMER
  source text not null default 'AI_GENERATED',
  knowledge_refs jsonb not null default '[]'::jsonb,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists trainings_org_idx on training_modules(organization_id);

create table if not exists training_assignments (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references training_modules(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  status text not null default 'ASSIGNED',
  unique (training_id, employee_id)
);

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

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  problem text,
  hypothesis text,
  proposed_solution text,
  evidence text,
  owner text,
  status text not null default 'IDEA', -- IDEA | EXPERIMENTING | VALIDATED | PARKED | LAUNCHED
  next_step text,
  created_at timestamptz not null default now()
);
create index if not exists ideas_org_idx on ideas(organization_id);

create table if not exists brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null, -- LOGO | GUIDELINE | TEMPLATE | SOCIAL | DOCUMENT
  description text,
  status text not null default 'READY'
);
create index if not exists brand_assets_org_idx on brand_assets(organization_id);

-- ───────── ECOSYSTEM & SETTINGS ─────────
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  category text not null, -- ACCOUNTING | CRM | SCHEDULING | PAYMENTS | EMAIL | STORAGE | HR | ECOMMERCE | DMS
  status text not null default 'DEMO', -- CONNECTED | DEMO | AVAILABLE
  data_available text,
  capabilities text,
  last_sync_at timestamptz,
  unique (organization_id, key)
);
create index if not exists integrations_org_idx on integrations(organization_id);

create table if not exists ai_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid unique not null references organizations(id) on delete cascade,
  observe boolean not null default true,
  recommend boolean not null default true,
  prepare boolean not null default true,
  execute boolean not null default false,
  automate boolean not null default false
);

-- ───────── PASSWORD RESETS ─────────
-- Single-use, 60-minute tokens. Hash (sha256 hex) stored; the raw token only
-- ever exists in the emailed link.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets(user_id);
create index if not exists password_resets_expiry_idx on password_resets(expires_at);

-- ───────── AUDIT ─────────
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null default 'USER', -- USER | AI | SYSTEM
  actor_id uuid references users(id),
  action text not null,
  target_type text,
  target_id uuid,
  detail text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_time_idx on audit_events(organization_id, created_at desc);

-- ───────── GROWTH: public Revenue Leak Score leads ─────────
-- Captured from the public /score page before results are shown.
create table if not exists score_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_name text,
  industry text,
  answers jsonb not null default '{}'::jsonb,
  score int not null default 0,
  top_leak text,
  top_leak_value numeric(12,2),
  created_at timestamptz not null default now(),
  contacted boolean not null default false
);
create index if not exists score_leads_created_idx on score_leads(created_at desc);
