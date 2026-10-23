-- Scan-lead inbox status fields for /pipeline/scan-leads.
-- scan_leads is org-less (public flyer-QR captures handled by the CUE
-- operator), so the inbox is gated by role, not organization scope.
alter table scan_leads
  add column if not exists status text not null default 'NEW';
alter table scan_leads
  drop constraint if exists scan_leads_status_check;
alter table scan_leads
  add constraint scan_leads_status_check
    check (status in ('NEW','CALLED','BOOKED','NOT_INTERESTED'));
alter table scan_leads
  add column if not exists note text;
alter table scan_leads
  add column if not exists updated_at timestamptz not null default now();
create index if not exists scan_leads_status_idx on scan_leads(status, created_at desc);
