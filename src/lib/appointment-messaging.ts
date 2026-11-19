import { sql } from "./db";
import { logAudit } from "./audit";
import { baseAppUrl } from "./plan-links";
import { mailerConnected, sendMail } from "./mailer";
import { sendWhatsAppText, whatsappConnected } from "./whatsapp";
import { confirmationUrl, ensureAppointmentConfirmation } from "./appointment-confirmations";
import { arrivalWindowLabel } from "./arrival-window-format";

type ConfirmationCopy = {
  tag: string;
  text: (name: string, org: string, title: string, when: string, link: string) => string;
  subject: (org: string, title: string, when: string) => string;
};

const CONFIRMATION: Record<string, ConfirmationCopy> = {
  en: {
    tag: "en-US",
    text: (name, org, title, when, link) =>
      `Hi ${name}, this is ${org}. Your ${title} is scheduled for ${when}. Please confirm it here: ${link}\n\nIf you need to change the time, reply to this message and we'll help.`,
    subject: (org, title, when) => `${org} — ${title} confirmed for ${when}`,
  },
  es: {
    tag: "es-US",
    text: (name, org, title, when, link) =>
      `Hola ${name}, le habla ${org}. Su ${title} está programado para ${when}. Confírmelo aquí: ${link}\n\nSi necesita cambiar la hora, responda a este mensaje y le ayudamos.`,
    subject: (org, title, when) => `${org} — ${title} confirmado para ${when}`,
  },
  vi: {
    tag: "vi-VN",
    text: (name, org, title, when, link) =>
      `Chào ${name}, đây là ${org}. Lịch ${title} của quý khách vào ${when}. Vui lòng xác nhận tại đây: ${link}\n\nNếu cần đổi giờ, vui lòng trả lời tin nhắn này để được hỗ trợ.`,
    subject: (org, title, when) => `${org} — Đã xác nhận ${title} vào ${when}`,
  },
  ar: {
    tag: "ar",
    text: (name, org, title, when, link) =>
      `مرحبًا ${name}، هذه ${org}. موعد ${title} في ${when}. يرجى تأكيده هنا: ${link}\n\nإذا كنت بحاجة إلى تغيير الوقت، فرد على هذه الرسالة وسنساعدك.`,
    subject: (org, title, when) => `${org} — تم تأكيد ${title} في ${when}`,
  },
};

function confirmationLocale(raw: unknown): keyof typeof CONFIRMATION {
  return typeof raw === "string" && raw in CONFIRMATION ? raw : "en";
}

function workspaceTimeZone(raw: unknown): string {
  const tz = typeof raw === "string" ? raw.trim() : "";
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
      return tz;
    } catch {
      // fall through
    }
  }
  return "America/Chicago";
}

export type SendConfirmationResult = {
  ok: boolean;
  channel?: "WHATSAPP" | "EMAIL";
  error?: string;
  already?: boolean;
  link?: string;
};

/**
 * Send one appointment confirmation. Manual Field Ops sends and the scheduled
 * 24-hour runner share this path so the message and audit record cannot drift
 * apart.
 */
export async function sendAppointmentConfirmation(
  orgId: string,
  appointmentId: string,
  opts: {
    actorType?: "USER" | "SYSTEM";
    actorId?: string | null;
    actorName?: string | null;
    source?: "MANUAL" | "AUTO_24H";
  } = {},
): Promise<SendConfirmationResult> {
  const [appt] = (await sql`
    select a.id, a.title, a.scheduled_for, a.status, a.arrival_window_minutes,
           c.id as customer_id, c.name as customer_name, c.email, c.phone, c.preferred_locale,
           o.name as organization_name,
           coalesce(nullif(bp.timezone, ''), 'America/Chicago') as timezone
    from appointments a
    join customers c on c.id = a.customer_id
    join organizations o on o.id = a.organization_id
    left join business_profiles bp on bp.organization_id = a.organization_id
    where a.id = ${appointmentId} and a.organization_id = ${orgId}`) as unknown as [{
    id: string; title: string; scheduled_for: Date; status: string;
    arrival_window_minutes: number | null;
    customer_id: string; customer_name: string; email: string | null; phone: string | null;
    preferred_locale: string | null;
    organization_name: string; timezone: string;
  } | undefined];

  if (!appt) return { ok: false, error: "Visit not in your workspace." };
  if (appt.status !== "SCHEDULED") return { ok: false, error: "Only scheduled visits can be confirmed." };

  const confirmation = await ensureAppointmentConfirmation(orgId, appt.id);
  if (!confirmation) return { ok: false, error: "Confirmation record could not be created." };
  const base = await baseAppUrl();
  const link = confirmationUrl(base, confirmation.token);
  // Idempotency: a confirmed or already-sent record never sends a second
  // message, even if the 24-hour runner retries after a partial failure.
  if (confirmation.confirmedAt || confirmation.sentAt) {
    return { ok: true, already: true, link };
  }

  // Reserve the send before touching a provider. Overlapping manual sends and
  // the 24-hour runner then have one winner; a crashed reservation goes stale
  // after five minutes so a later run can recover it.
  const [reserved] = (await sql`
    update appointment_confirmations
    set status = 'SENDING', updated_at = now()
    where id = ${confirmation.id}
      and confirmed_at is null and sent_at is null
      and (status <> 'SENDING' or updated_at < now() - interval '5 minutes')
    returning id`) as unknown as { id: string }[];
  if (!reserved) {
    return { ok: false, error: "A confirmation send is already in progress for this visit." };
  }

  let delivered = false;
  let channel: "WHATSAPP" | "EMAIL" | null = null;
  try {
    const tz = workspaceTimeZone(appt.timezone);
    const locale = confirmationLocale(appt.preferred_locale);
    const copy = CONFIRMATION[locale];
    const when = new Intl.DateTimeFormat(copy.tag, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(appt.scheduled_for));
    const customerName = appt.customer_name.trim() || "there";
    const arrival = arrivalWindowLabel(locale, appt.arrival_window_minutes);
    const text = copy.text(customerName, appt.organization_name, appt.title, when, link)
      + (arrival ? `\n\n${arrival}` : "");
    const subject = copy.subject(appt.organization_name, appt.title, when);

    let error: string | undefined;
    if (appt.phone && whatsappConnected()) {
      const result = await sendWhatsAppText(String(appt.phone), text);
      if (result.sent) channel = "WHATSAPP";
      else error = result.error ?? "WhatsApp could not send the confirmation.";
    }
    if (!channel && appt.email && mailerConnected()) {
      const result = await sendMail({ to: String(appt.email), subject, text });
      if (result.sent) channel = "EMAIL";
      else error = result.error ?? "Email could not send the confirmation.";
    }

    if (!channel) {
      return {
        ok: false,
        error: error ?? (appt.phone || appt.email
          ? "No messaging channel is connected. Set up WhatsApp or email first."
          : "This customer has no phone or email on file."),
      };
    }

    // The provider accepted the message. From here on the record must not be
    // reset to PENDING, or a retry would send the customer a duplicate.
    delivered = true;
    try {
      await sql`
        insert into communications (organization_id, customer_id, channel, direction, summary)
        values (${orgId}, ${appt.customer_id},
          ${channel === "EMAIL" ? "EMAIL" : "SMS"}, 'OUTBOUND',
          ${`Appointment confirmation sent via ${channel === "EMAIL" ? "email" : "WhatsApp"} (${locale}): ${appt.title} on ${when}`})`;
    } catch (e) {
      // The message is already out; a missing activity row must not make the
      // send retryable.
      console.error("confirmation activity insert failed", appt.id, e);
    }
    await logAudit({
      organizationId: orgId,
      actorType: opts.actorType ?? "USER",
      actorId: opts.actorId ?? null,
      action: "APPOINTMENT_CONFIRMATION_SENT",
      targetType: "Appointment",
      targetId: appt.id,
      detail: `"${appt.title}" confirmation sent to ${appt.customer_name} via ${channel.toLowerCase()} in ${locale}${opts.source === "AUTO_24H" ? " (24-hour cadence)" : ""}`,
      metadata: { channel, appointmentId: appt.id, locale, source: opts.source ?? "MANUAL", actorName: opts.actorName ?? null },
    });
    return { ok: true, channel, link };
  } finally {
    if (delivered && channel) {
      try {
        await sql`
          update appointment_confirmations
          set status = 'SENT', method = ${channel}, sent_at = now(), updated_at = now(),
              auto_send_error = null
          where id = ${confirmation.id} and confirmed_at is null`;
      } catch (e) {
        // The provider send succeeded. Leave the reservation in place rather
        // than reopening it for a duplicate send; surface it for repair.
        console.error("confirmation send state update failed", appt.id, e);
      }
    } else {
      await sql`
        update appointment_confirmations
        set status = 'PENDING', updated_at = now()
        where id = ${confirmation.id} and status = 'SENDING' and sent_at is null`;
    }
  }
}
