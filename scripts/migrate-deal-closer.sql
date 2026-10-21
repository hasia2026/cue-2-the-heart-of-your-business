-- deals.sold_by_id — the closer of record for a vehicle deal.
-- Backing the "who sold what" sales leaderboard (People page) and the
-- closer column on Pipeline → Deals. Exactly one closer per deal; co-sell
-- split is deliberately out of scope for the pilot.
alter table deals add column if not exists sold_by_id uuid references employees(id);
create index if not exists deals_org_sold_idx on deals(organization_id, sold_by_id);
