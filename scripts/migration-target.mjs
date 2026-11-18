// Shared connection guard for schema-changing scripts.
//
// The application keeps using the pooled DATABASE_URL at runtime. DDL should
// use MIGRATION_DATABASE_URL (direct or Supabase session mode on port 5432).
// Falling back to DATABASE_URL is allowed only when it is not pooled.

function targetLabel(url) {
  const database = url.pathname.replace(/^\/+/, "") || "(default)";
  return `${url.hostname}${url.port ? `:${url.port}` : ""}/${database}`;
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPooledUrl(url) {
  const pgbouncer = url.searchParams.get("pgbouncer");
  return url.port === "6543" || pgbouncer === "1" || pgbouncer === "true";
}

export function resolveMigrationUrl(env = process.env) {
  const raw = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "MIGRATION_DATABASE_URL is not set. Use the direct or session-mode (port 5432) database URL for schema changes.",
    );
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL is not a valid Postgres connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("MIGRATION_DATABASE_URL must be a Postgres connection URL.");
  }
  if (isPooledUrl(url)) {
    throw new Error(
      `Refusing schema changes through a pooled connection (${targetLabel(url)}). Set MIGRATION_DATABASE_URL to the direct or session-mode port 5432 URL.`,
    );
  }
  return raw;
}

export function assertFreshAllowed(url, confirmed) {
  if (!confirmed && !isLocalHost(url.hostname)) {
    throw new Error(
      `Refusing --fresh against non-local database ${targetLabel(url)}. Re-run with --confirm-fresh only if this is an intentional disposable database.`,
    );
  }
}
