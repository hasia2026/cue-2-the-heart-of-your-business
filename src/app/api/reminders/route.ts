import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendArReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Automated localized payment reminders — the owner-approved cadence.
 * Vercel Cron hits here daily (vercel.json); Authorization: Bearer CRON_SECRET
 * guards it in production, exactly like the digest cron.
 *
 * Which orgs fire today: business_profiles.reminders_on = true (the owner's
 * approval — nothing automates until it is set) AND the cadence interval has
 * elapsed since the last automated send. Reminders go out only for invoices
 * still unpaid (SENT/OVERDUE): customers who paid drop off automatically, and
 * each customer gets the message in their stored language.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  const orgs = await sql`
    select bp.organization_id, bp.reminders_every_days
    from business_profiles bp
    where bp.reminders_on = true
      and (bp.last_reminder_sent_at is null
           or now() - bp.last_reminder_sent_at >= make_interval(days => greatest(bp.reminders_every_days, 1)))`;

  const results: ({ org: string } & Partial<Record<"sent" | "attempted" | "leftover" | "skipped" | "error", string | number>>)[] = [];
  for (const org of orgs) {
    try {
      const { sent, attempted, leftover } = await sendArReminders(org.organization_id, {
        auditAction: "AUTOMATED_PAYMENT_REMINDER_SENT",
        auditDetail: `automated send every ${org.reminders_every_days} day(s)`,
      });
      if (attempted > 0) {
        // Only orgs with drafts are stamped — an org with nothing due keeps
        // its last-send time untouched so the cadence doesn't slip.
        await sql`
          update business_profiles
          set last_reminder_sent_at = now()
          where organization_id = ${org.organization_id}`;
      }
      // leftover = customers with unpaid invoices beyond the per-run send cap;
      // recorded in the audit detail by sendArReminders itself, and surfaced
      // here so whoever reads the cron payload sees nothing went dark.
      results.push({ org: org.organization_id, sent, attempted, leftover });
    } catch (e) {
      results.push({ org: org.organization_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
