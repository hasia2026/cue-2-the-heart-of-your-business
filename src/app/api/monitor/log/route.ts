// Monitor ingest — writes one error occurrence to the deduped events table.
// Auth: MONITOR_INGEST_TOKEN (header x-cue-monitor) or any valid CUE session.
// Server-side hook calls this from instrumentation.ts; global-error reports
// client digests here too.
import { NextRequest, NextResponse } from "next/server";
import { recordError } from "@/lib/monitor";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expected = process.env.MONITOR_INGEST_TOKEN;
  const provided = req.headers.get("x-cue-monitor");
  let authorized = false;
  if (expected && provided && provided === expected) {
    authorized = true;
  } else {
    try {
      authorized = !!(await getSession());
    } catch {
      authorized = false;
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const message = typeof b.message === "string" && b.message.trim() ? b.message.trim().slice(0, 500) : null;
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  await recordError({
    message,
    digest: typeof b.digest === "string" ? b.digest.slice(0, 100) : null,
    path: typeof b.path === "string" ? b.path.slice(0, 300) : null,
    method: typeof b.method === "string" ? b.method.slice(0, 10) : null,
    routePath: typeof b.routePath === "string" ? b.routePath.slice(0, 300) : null,
    routeType: typeof b.routeType === "string" ? b.routeType.slice(0, 20) : null,
    source: b.source === "CLIENT" ? "CLIENT" : "SERVER",
  });
  return NextResponse.json({ ok: true });
}
