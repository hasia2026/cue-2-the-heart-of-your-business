-- Desking profitometer — per-deal front/back gross.
-- front_gross: negotiated selling-side margin (deal.amount minus vehicle
-- cost), derived when null so legacy deals keep rendering.
-- back_gross: F&I / add-on product gross (warranty, GAP, etc), manager-set.
alter table deals add column if not exists front_gross numeric(12,2);
alter table deals add column if not exists back_gross numeric(12,2) not null default 0;
create index if not exists deals_org_status_gross_idx on deals(organization_id, status, front_gross);
