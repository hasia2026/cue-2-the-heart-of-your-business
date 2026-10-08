-- Password reset tokens — single-use, 60-minute expiry, token hash stored.
-- The raw token only ever exists in the emailed link; a sha256 hex digest is
-- stored so a database leak cannot be replayed into a session.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets(user_id);
create index if not exists password_resets_expiry_idx on password_resets(expires_at);
