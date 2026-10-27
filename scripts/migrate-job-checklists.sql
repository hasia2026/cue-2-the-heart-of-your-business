-- Per-job Scope of Work + Checklist:
--   scope: free text, one field the owner can dump "what we're doing / what it
--          includes / customer expectations" into — visible everywhere a job is.
--   checklist: jsonb array of {label, done} items, ticked off from the job row
--          itself — no need to open each job to find where things stand.
alter table service_orders add column if not exists scope text;
alter table service_orders add column if not exists checklist jsonb not null default '[]'::jsonb;
