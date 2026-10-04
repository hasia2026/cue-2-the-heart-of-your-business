/**
 * Generates prisma/schema.postgres.prisma — a Postgres-ready copy of the
 * canonical SQLite schema (provider swap + directUrl + String ids via
 * @db.Text where needed). Run `npm run db:pg:schema` after every schema
 * change so the two never drift.
 *
 * Transformations applied:
 *  1. provider  "sqlite" → "postgresql"
 *  2. datasource gains directUrl = env("DIRECT_URL") (Supabase pooler vs direct)
 *  3. header comment noting the file is GENERATED — edit schema.prisma instead
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "prisma", "schema.prisma");
const out = path.join(__dirname, "..", "prisma", "schema.postgres.prisma");

let s = fs.readFileSync(src, "utf8");

s = s.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`
);

s = s.replace(
  /\/\/ CUE — data architecture[\s\S]*?\n\n/,
  `// CUE — data architecture (POSTGRES COPY — GENERATED FILE)
// Source of truth: prisma/schema.prisma (SQLite, local dev).
// Regenerate with: npm run db:pg:schema
// Deploy: DATABASE_URL + DIRECT_URL point at Supabase, then npm run db:pg:push

`
);

fs.writeFileSync(out, s);
console.log("Wrote", out);
