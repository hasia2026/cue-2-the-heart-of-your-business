-- Documents: time-limited share links (single token, revocable)
alter table documents add column if not exists share_token uuid;
alter table documents add column if not exists share_expires timestamptz;
