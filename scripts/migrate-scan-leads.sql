-- Public scan-call requests captured by the flyer QR landing page (/scan).
-- No auth: unauthenticated submissions, rate-limited at the route. Columns
-- are intentionally narrow — name/shop/phone only, nothing sensitive.
create table if not exists scan_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop text not null,
  phone text not null,
  email text,
  source text not null default 'FLYER',
  created_at timestamptz not null default now()
);
create index if not exists scan_leads_created_idx on scan_leads(created_at);
