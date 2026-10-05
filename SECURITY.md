# CUE Security Model (v2)

## Tenancy & isolation
- Every business table carries `organization_id`; **every** query filters by it using the
  org resolved from the signed session — no org id is ever accepted from the client.
- The app connects as a single privileged Postgres role. Application-layer isolation is
  the enforcement point (same model as v1). For defense-in-depth, Supabase RLS can be
  layered on when the app moves to Supabase Auth / per-user JWTs (tracked in
  PRODUCTION-CHECKLIST.md).

## Authentication
- Passwords: `scrypt` (64-byte derived key, per-user random salt, timing-safe compare).
- Sessions: HMAC-SHA256-signed stateless cookie (`cue_session`), `httpOnly`,
  `sameSite=lax`, `secure` in production, 30-day expiry. Secret lives only in env
  (`CUE_SESSION_SECRET`, ≥32 chars enforced at runtime).
- Sign-out deletes the cookie. Password reset flow exists in the auth schema (hashed
  single-use tokens) — wire the mailer before public launch.

## Server-side validation & injection safety
- All SQL is parameterized through `postgres.js` tagged templates; no string-built SQL.
- Server Actions validate session + org before any write; API routes return 401/404 on
  mismatched org lookups.
- File uploads are registered with metadata only in v2-pilot (no arbitrary executable
  storage); binary extraction is gated behind a document processor.

## Secrets
- `.env` is gitignored and never committed. Vercel env vars hold production secrets.
- The pilot DB password is temporary — rotate before real users (Supabase → Settings →
  Database → Reset database password) and prefer a dedicated least-privilege role.

## Auditability
- `audit_events` records: actor (user/AI/system), action, target, detail, metadata,
  timestamp — for recommendations, decisions, workflows, captures, settings changes.

## Data protection roadmap
1. Rotate DB credentials before pilot users (owner-approved).
2. Enable Supabase RLS + move auth to Supabase Auth JWTs for belt-and-braces isolation.
3. Add per-tenant encryption-at-rest review (Supabase provides AES-256 at rest by default).
4. Rate-limit auth + assistant endpoints (basic limiter exists; tune for production).
5. Backups: enable Supabase PITR (paid tier) before real customer data.
