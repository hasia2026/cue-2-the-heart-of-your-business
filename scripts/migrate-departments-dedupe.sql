-- Deduplicate departments: same org + same name must be one folder.
-- Keeps one row per (organization_id, name), re-points documents and
-- employees to the survivor, deletes the rest — then adds a unique index
-- so duplicates (seed reruns, folder-creation races) are impossible.
-- Safe to run repeatedly.

-- 1) Re-point references from duplicates to the surviving row (first id
--    per (org, name) in deterministic id order).
update documents
set department_id = keep.keep_id
from (
  select d.id, first_value(d.id) over (partition by d.organization_id, d.name order by d.id) as keep_id
  from departments d
) keep
where documents.department_id = keep.id and keep.id <> keep.keep_id;

update employees
set department_id = keep.keep_id
from (
  select d.id, first_value(d.id) over (partition by d.organization_id, d.name order by d.id) as keep_id
  from departments d
) keep
where employees.department_id = keep.id and keep.id <> keep.keep_id;

-- 2) Delete the losers (references now point at the survivor).
delete from departments
where id in (
  select id from (
    select d.id, row_number() over (partition by d.organization_id, d.name order by d.id) as rn
    from departments d
  ) ranked
  where rn > 1
);

-- 3) Enforce uniqueness at the database level (also what fileToFolder's
--    race guard depends on to detect a concurrent insert).
create unique index if not exists departments_org_name_key
  on departments(organization_id, name);
