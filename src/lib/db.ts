import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __cueSql: postgres.Sql | undefined;
}

function make(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // safe for pgbouncer/Supavisor pooled connections on Vercel
  });
}

export const sql: postgres.Sql = globalThis.__cueSql ?? make();

if (process.env.NODE_ENV !== "production") globalThis.__cueSql = sql;

export type Row = Record<string, unknown>;
