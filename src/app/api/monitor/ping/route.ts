// Daily cron uptime heartbeat (vercel.json). Guarded by CRON_SECRET like the
// digest route; in dev (no secret set, NODE_ENV != production) it runs open so
// you can trigger it manually from a browser.
import { NextRequest, NextResponse } from "next/server";
import { runHeartbeat } from "@/lib/monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  const result = await runHeartbeat();
  return NextResponse.json(result);
}
