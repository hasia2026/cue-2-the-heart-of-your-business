-- Revenue attribution + job-type tracking (the dealership asked "which tech
-- generated this revenue, separate from who completed the job?")
-- and "split diagnostics from service upgrades from panel swaps".
--
-- Leads ROI: leads.source and leads.source_status resolve the "which lead
-- source actually makes money" ask — can't group by status alone since the
-- lifecycle never lets most leads reach a terminal status.
--
-- Deal origin: deals.origin_lead_id lets Pipeline group closed deals by the
-- lead source that originated them, not just by the lead's own status.
alter table leads add column if not exists source_origin text;
alter table leads add column if not exists source_status text;
-- Service-type label resolved from the lead's interest text (diagnostic vs.
-- panel swap vs. EV charger vs. maintenance) — makes the HCP ask “I'd rather
-- look back and see how many calls were diagnostics / upgrades / chargers”
-- answerable on the lead side too, not just on service orders.
alter table leads add column if not exists service_type text;
-- Follow-up SLA: the owner-set due date for the next contact on this lead.
-- Overdue leads get a red badge on Pipeline; the stale-lead detector stays
-- generic, this makes the deadline explicit and per-lead.
alter table leads add column if not exists next_action_at timestamptz;
create index if not exists leads_org_next_action_idx on leads(organization_id, next_action_at);
alter table deals add column if not exists origin_lead_id uuid references leads(id);
alter table deals add column if not exists sold_by uuid;
alter table deals add column if not exists service_type text;
alter table service_orders add column if not exists sold_by uuid;
alter table service_orders add column if not exists sold_by_is_tech boolean;
alter table service_orders add column if not exists service_type text;
create index if not exists service_orders_org_type_idx on service_orders(organization_id, service_type);
