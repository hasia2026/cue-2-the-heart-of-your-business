-- Duplicate detector support: store a content hash (sha256 of the uploaded
-- file's bytes, or of normalized note text) on each document so the capture
-- flow can block identical re-uploads. Safe to run repeatedly.
alter table documents add column if not exists content_hash text;
create index if not exists documents_org_hash_idx on documents(organization_id, content_hash);
