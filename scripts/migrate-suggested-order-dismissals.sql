-- Revi's suggested order: dismissed follow-ups. The owner's "I chased this,
-- done" list — a dismissed row drops off the card and the digest until it is
-- restored. Keyed by (organization_id, category, record), the same identity
-- the row has in its source table, so a re-import or a re-render can never
-- duplicate it; restoring deletes the row, and fixing the source record
-- (payment received, vehicle landed, contact filled in) also removes it
-- naturally because the suggested order reads the live tables. Comments are
-- full-line-only (run-sql splits on semicolons).
create table if not exists suggested_order_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category text not null, -- INVOICE_OVERDUE | VEHICLE_IN_TRANSIT | CONTACT_INFO
  record text not null,
  detail text,
  actor_id uuid references users(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  constraint suggested_order_dismissals_cat_chk
    check (category in ('INVOICE_OVERDUE', 'VEHICLE_IN_TRANSIT', 'CONTACT_INFO'))
);
create unique index if not exists suggested_order_dismissals_org_unique
  on suggested_order_dismissals(organization_id, category, record);
create index if not exists suggested_order_dismissals_org_created_idx
  on suggested_order_dismissals(organization_id, created_at desc);
