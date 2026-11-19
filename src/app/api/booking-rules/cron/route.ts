import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { processBookingConfirmationCadence } from "@/lib/booking-cadence";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron: the 24-hour confirmation cadence, swept at 00/06/12/18 UTC so a
 * visit is picked up inside its final day even on the Hobby plan. Only orgs
 * that explicitly enabled confirm_24h are processed. Failures create one task;
 * they are never silently swallowed.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  const orgs = (await sql`
    select organization_id from field_ops_rules
    where rule_key = 'confirm_24h' and enabled = true`) as unknown as {
    organization_id: string;
  }[];

  const results = [];
  for (const org of orgs) {
    try {
      // Keep each run inside the 60s function budget; unclaimed visits are
      // picked up by the next six-hour sweep.
      results.push(await processBookingConfirmationCadence(org.organization_id, 25));
    } catch (e) {
      results.push({
        org: org.organization_id,
        attempted: 0,
        sent: 0,
        already: 0,
        failed: 0,
        skipped: 0,
        exhausted: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ results });
}
