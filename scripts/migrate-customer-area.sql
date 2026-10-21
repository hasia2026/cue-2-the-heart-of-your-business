-- Dispatch board: town/area label per customer, used to group unscheduled
-- service-plan maintenance jobs for routing (the HCP unscheduled-jobs gap).
alter table customers
  add column if not exists area text;
create index if not exists customers_org_area_idx on customers(organization_id, area);
