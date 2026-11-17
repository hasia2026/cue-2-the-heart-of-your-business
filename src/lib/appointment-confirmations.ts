import { sql } from "./db";

export type AppointmentConfirmation = {
  id: string;
  organizationId: string;
  appointmentId: string;
  token: string;
  status: string;
  sentAt: Date | null;
  confirmedAt: Date | null;
};

/** Every appointment gets exactly one confirmation record; create lazily so
 *  older rows and newly-created appointments behave the same without a DB
 *  trigger (which the SQL runner cannot parse). */
export async function ensureAppointmentConfirmation(
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentConfirmation | null> {
  await sql`
    insert into appointment_confirmations (organization_id, appointment_id)
    select organization_id, id from appointments
    where id = ${appointmentId} and organization_id = ${organizationId}
    on conflict (appointment_id) do nothing`;
  const [row] = (await sql`
    select id, organization_id, appointment_id, token, status, sent_at, confirmed_at
    from appointment_confirmations
    where appointment_id = ${appointmentId} and organization_id = ${organizationId}`) as unknown as [{
      id: string; organization_id: string; appointment_id: string; token: string;
      status: string; sent_at: Date | null; confirmed_at: Date | null;
    } | undefined];
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    appointmentId: String(row.appointment_id),
    token: String(row.token),
    status: String(row.status),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
  };
}

export function confirmationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/confirm/${token}`;
}
