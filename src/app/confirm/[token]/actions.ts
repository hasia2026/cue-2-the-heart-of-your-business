"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

/** Customer-facing write. The token is the capability; no session is read. */
export async function confirmAppointmentByToken(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!TOKEN_RE.test(token)) redirect("/confirm/not-found");

  const [row] = (await sql`
    select ac.id, ac.organization_id, ac.appointment_id, ac.confirmed_at,
           a.title, a.status
    from appointment_confirmations ac
    join appointments a on a.id = ac.appointment_id
    where ac.token = ${token}`) as unknown as [{
      id: string; organization_id: string; appointment_id: string;
      confirmed_at: Date | null; title: string; status: string;
    } | undefined];

  if (!row) redirect("/confirm/not-found");
  if (row.confirmed_at) redirect(`/confirm/${token}`);
  if (row.status !== "SCHEDULED") redirect(`/confirm/${token}?error=closed`);

  await sql.begin(async (tx) => {
    await tx`
      update appointment_confirmations
      set status = 'CONFIRMED', method = 'CUSTOMER_LINK',
          confirmed_at = now(), updated_at = now()
      where id = ${row.id} and confirmed_at is null`;
    await tx`
      update appointments set confirmed_at = now()
      where id = ${row.appointment_id} and organization_id = ${row.organization_id}`;
  });
  await logAudit({
    organizationId: row.organization_id,
    actorType: "SYSTEM",
    action: "APPOINTMENT_CONFIRMED_BY_CUSTOMER",
    targetType: "Appointment",
    targetId: row.appointment_id,
    detail: `Customer confirmed "${row.title}" from the confirmation link`,
  });

  revalidatePath(`/confirm/${token}`);
  revalidatePath("/field-ops");
  revalidatePath("/pipeline");
  redirect(`/confirm/${token}?confirmed=1`);
}
