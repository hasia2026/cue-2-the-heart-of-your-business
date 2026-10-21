import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildArReminders, sendArReminders, type ArReminderDraft } from "@/lib/reminders";
import { rateLimitResult } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Localized payment reminders for unpaid invoices.
 *   POST {}             → dry run: the drafts that WOULD go out
 *   POST {confirm:true} → send WhatsApp (phone) else email per customer
 *
 * Draft-first by design: nothing is delivered until confirm:true, and the
 * send path is the exact same shared helper the automated cadence cron uses
 * (GET /api/reminders), so an owner approving the cadence automates content
 * they have already seen the shape of.
 * Owner/Admin/Manager only; 20 send runs/org/hour (it fan-outs to real
 * customers, so a runaway loop must hit a wall).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (session.role === "MEMBER") {
    return NextResponse.json({ error: "Owner, Admin or Manager access required" }, { status: 403 });
  }

  const rl = rateLimitResult(`reminders:${session.organizationId}`, 20, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Reminder limit reached — try again in ${rl.retryAfterSecs}s.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSecs) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const confirm = Boolean(body?.confirm);

  const previewOf = (d: ArReminderDraft) => ({
    customerId: d.customerId,
    customerName: d.customerName,
    locale: d.locale,
    invoiceNumbers: d.invoiceNumbers,
    total: d.total,
    text: d.text,
  });
  const all = await buildArReminders(session.organizationId);
  const drafts = all.slice(0, 10);

  if (!confirm) {
    // Preview shows the first 10 fully and counts the rest, so a large
    // backlog is visible before anyone hits confirm.
    return NextResponse.json({ draft: true, count: drafts.length,
      leftover: Math.max(0, all.length - drafts.length), drafts: drafts.map(previewOf) });
  }

  const { sent, attempted, leftover, results, drafts: sentDrafts } = await sendArReminders(session.organizationId);
  return NextResponse.json({ sent, attempted, leftover, results, drafts: sentDrafts.map(previewOf) });
}
