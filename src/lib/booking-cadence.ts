import { sql } from "./db";
import { sendAppointmentConfirmation } from "./appointment-messaging";
import { getBookingRules } from "./booking-preferences";

/** One automatic attempt per visit every six hours, capped at three. */
const RETRY_AFTER_HOURS = 6;
const MAX_AUTO_ATTEMPTS = 3;

export type CadenceResult = {
  org: string;
  /** Rows this run claimed and tried to send. */
  attempted: number;
  sent: number;
  already: number;
  failed: number;
  /** Eligible at select time but claimed by another run (or completed). */
  skipped: number;
  /** Failures that reached the attempt cap; the task stays open for staff. */
  exhausted: number;
  error?: string;
  skippedReason?: string;
};

function taskTitle(customer: string, title: string): string {
  return `Confirm ${customer} — ${title}`.slice(0, 200);
}

async function closeFailureTask(orgId: string, title: string): Promise<void> {
  await sql`
    update tasks
    set status = 'DONE', completed_at = now()
    where organization_id = ${orgId} and origin = 'BOOKING_RULES'
      and title = ${title} and status in ('OPEN', 'IN_PROGRESS')`;
}

async function ensureFailureTask(
  orgId: string,
  appt: { id: string; customer_id: string; customer: string; title: string },
  error: string,
  attempt: number,
): Promise<void> {
  const title = taskTitle(appt.customer, appt.title);
  const capped = attempt >= MAX_AUTO_ATTEMPTS;
  await sql`
    insert into tasks (organization_id, title, detail, status, priority, due_at, customer_id, origin)
    select ${orgId}, ${title},
           ${`The 24-hour booking rule could not send this confirmation (attempt ${attempt}/${MAX_AUTO_ATTEMPTS}): ${error} ${capped ? "Automatic retries are exhausted. " : ""}Open Field Ops and send it manually, or fix the customer's contact/channel and retry.`},
           'OPEN', 'HIGH', now(), ${appt.customer_id}, 'BOOKING_RULES'
    where not exists (
      select 1 from tasks t
      where t.organization_id = ${orgId}
        and t.origin = 'BOOKING_RULES'
        and t.title = ${title}
        and t.status in ('OPEN', 'IN_PROGRESS')
    )`;
}

/**
 * The 24-hour rule. It reuses the durable confirmation record and the shared
 * messaging helper, so the customer-facing copy, channel fallback and audit
 * trail cannot drift from a manual send.
 *
 * Guarantees:
 *  - One automatic attempt per visit per six hours, at most three attempts.
 *  - Idempotent under overlapping cron runs: each visit is claimed with an
 *    atomic UPDATE before anything is sent, and the helper refuses to resend
 *    once sent_at/confirmed_at is set.
 *  - WhatsApp is tried first, then email; the helper records which channel won.
 *  - Failures never disappear: one deduped staff task is created, updated with
 *    the attempt count, and closed automatically when a later run succeeds.
 */
export async function processBookingConfirmationCadence(
  orgId: string,
  limit = 50,
): Promise<CadenceResult> {
  const base: CadenceResult = {
    org: orgId,
    attempted: 0,
    sent: 0,
    already: 0,
    failed: 0,
    skipped: 0,
    exhausted: 0,
  };

  // A rule that is off for the workspace must not send anything, even if a
  // caller invokes the runner directly instead of through the cron route.
  const rules = await getBookingRules(orgId);
  if (!rules.confirm24h) return { ...base, skippedReason: "confirm_24h is off" };

  // Materialize confirmation rows for visits that entered the window after the
  // last run; the rest of the app uses the same lazy-ensure pattern.
  await sql`
    insert into appointment_confirmations (organization_id, appointment_id)
    select a.organization_id, a.id from appointments a
    where a.organization_id = ${orgId}
      and a.status = 'SCHEDULED'
      and a.scheduled_for > now()
      and a.scheduled_for <= now() + interval '24 hours'
    on conflict (appointment_id) do nothing`;

  const due = (await sql`
    select a.id, a.title, a.scheduled_for, a.customer_id, c.name as customer,
           ac.auto_send_attempts
    from appointments a
    join customers c on c.id = a.customer_id
    join appointment_confirmations ac on ac.appointment_id = a.id
    where a.organization_id = ${orgId}
      and a.status = 'SCHEDULED'
      and a.scheduled_for > now()
      and a.scheduled_for <= now() + interval '24 hours'
      and ac.confirmed_at is null
      and ac.sent_at is null
      and ac.auto_send_attempts < ${MAX_AUTO_ATTEMPTS}
      and (ac.auto_send_attempted_at is null
           or ac.auto_send_attempted_at < now() - interval '6 hours')
    order by a.scheduled_for asc
    limit ${limit}`) as unknown as {
    id: string; title: string; scheduled_for: Date; customer_id: string; customer: string;
    auto_send_attempts: number;
  }[];

  let attempted = 0;
  let sent = 0;
  let already = 0;
  let failed = 0;
  let skipped = 0;
  let exhausted = 0;

  for (const appt of due) {
    // Atomic claim: only one runner can move this visit's attempt counter
    // forward. A concurrent run (or a run after the customer confirmed/sent)
    // gets no row back and stays silent.
    const claimed = (await sql`
      update appointment_confirmations
      set auto_send_attempted_at = now(),
          auto_send_attempts = auto_send_attempts + 1,
          auto_send_error = null
      where appointment_id = ${appt.id}
        and confirmed_at is null
        and sent_at is null
        and auto_send_attempts < ${MAX_AUTO_ATTEMPTS}
        and (auto_send_attempted_at is null
             or auto_send_attempted_at < now() - interval '6 hours')
      returning auto_send_attempts`) as unknown as { auto_send_attempts: number }[];

    const claim = claimed[0];
    if (!claim) {
      skipped += 1;
      continue;
    }
    attempted += 1;
    const attempt = Number(claim.auto_send_attempts);
    const title = taskTitle(appt.customer, appt.title);

    const result = await sendAppointmentConfirmation(orgId, String(appt.id), {
      actorType: "SYSTEM",
      source: "AUTO_24H",
    });

    if (result.ok) {
      // The helper already marked the record SENT (or it was confirmed).
      await sql`
        update appointment_confirmations
        set auto_send_error = null
        where appointment_id = ${appt.id}`;
      await closeFailureTask(orgId, title);
      if (result.already) already += 1;
      else sent += 1;
      continue;
    }

    failed += 1;
    if (attempt >= MAX_AUTO_ATTEMPTS) exhausted += 1;
    const error = (result.error ?? "Confirmation could not be sent.").slice(0, 1000);
    await sql`
      update appointment_confirmations
      set auto_send_error = ${error}
      where appointment_id = ${appt.id}`;
    await ensureFailureTask(orgId, appt, error, attempt);
  }

  return { org: orgId, attempted, sent, already, failed, skipped, exhausted };
}
