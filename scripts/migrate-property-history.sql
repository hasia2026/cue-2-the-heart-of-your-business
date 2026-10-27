-- Property-specific service history (Toni's multi-property fix):
-- A customer account can own many properties; every service_order now records
-- WHICH property it was for. History filters by address instead of dumping all
-- 30 locations' records in one scroll. Customers.address stays as the primary
-- contact address; the job's property_address is the place that was serviced.
alter table service_orders add column if not exists property_address text;

-- Existing jobs inherit the customer's address as their property so nothing
-- becomes "unknown property" in the new filter.
update service_orders s
set property_address = c.address
from customers c
where s.customer_id = c.id and c.address is not null and s.property_address is null;
