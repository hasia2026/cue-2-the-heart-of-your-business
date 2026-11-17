-- Booking requests capture the slot the visitor picked. scan_leads already
-- holds the contact details; this is the only extra field.
alter table scan_leads add column if not exists preferred_time text;
