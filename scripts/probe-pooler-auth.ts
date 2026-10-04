/** Prints the FULL Prisma error for pooled connection attempts.
 *  Tries .env first, then region fallbacks with PW env var. */
import { PrismaClient } from "@prisma/client";

const REF = "mgqwvgzhyqfscnnwejeh";
const PW = process.env.PW ?? "";
const REGIONS = (process.env.REGIONS ?? "ca-central-1").split(",");

async function tryUrl(label: string, url: string) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const n = await prisma.organization.count();
    console.log(`✓ ${label} — SUCCESS, org count ${n}`);
    return true;
  } catch (e: unknown) {
    const err = e as { message?: string };
    const lines = err.message?.split("\n").filter((l) => /FATAL|not valid|ENOTFOUND|ENOIDENT|P10\d\d/i.test(l)).slice(0, 2).join(" | ");
    console.log(`✗ ${label} — ${lines ?? "unknown error"}`);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  // 1. Whatever is in .env right now
  if (await tryUrl("from .env", process.env.DATABASE_URL ?? "")) return;
  // 2. Explicit password (fresh from user) across region fallbacks
  if (PW) {
    for (const region of REGIONS) {
      const r = region.trim();
      if (await tryUrl(`tx pooler :6543 @ ${r} (PW)`, `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@aws-0-${r}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5`)) return;
      if (await tryUrl(`session :5432 @ ${r} (PW)`, `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@aws-0-${r}.pooler.supabase.com:5432/postgres`)) return;
    }
  }
  console.log("NO WORKING CONNECTION");
}
main();
