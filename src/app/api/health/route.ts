import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageBackend } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────
// GET /api/health — for uptime monitors and deploy checks.
// 200 when the app can reach its database, 503 otherwise.
// Never cached; leaks no internals beyond status flags.
// ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = { app: "ok", database: "fail" };
  let status = 503;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
    status = 200;
  } catch {
    // database unreachable — report 503
  }
  checks.storageBackend = storageBackend() === "SUPABASE" ? "supabase" : "local";

  return NextResponse.json(
    { status: status === 200 ? "healthy" : "unhealthy", checks, time: new Date().toISOString() },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
