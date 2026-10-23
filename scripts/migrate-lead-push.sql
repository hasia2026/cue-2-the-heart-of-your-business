-- Owner phone-ping subscriptions for the Web Push "whisper" (VAPID).
-- endpoint is unique per browser subscription; re-granting upserts (keys can
-- rotate on a renewal). Stale/410-gone endpoints are deleted by the sender.
create table if not exists lead_push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique check (length(endpoint) between 10 and 1000),
  keys jsonb not null check (jsonb_typeof(keys) = 'object' and keys ? 'auth' and keys ? 'p256dh'),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_push_subscriptions_created_idx
  on lead_push_subscriptions (created_at);
