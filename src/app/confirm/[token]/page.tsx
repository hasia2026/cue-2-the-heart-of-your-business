import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { arrivalWindowLabel } from "@/lib/arrival-window-format";
import { confirmAppointmentByToken } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirm your visit — CUE",
  robots: { index: false, follow: false },
};

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

const COPY: Record<string, {
  tag: string;
  eyebrow: string;
  prepared: string;
  prompt: string;
  confirm: string;
  confirmedTitle: string;
  confirmedBody: string;
  closedTitle: string;
  closedBody: string;
  errorTitle: string;
  errorBody: string;
  footer: string;
}> = {
  en: {
    tag: "en-US",
    eyebrow: "Visit confirmation",
    prepared: "For",
    prompt: "Please confirm this visit so the team can plan the day. It takes one click.",
    confirm: "Confirm my visit",
    confirmedTitle: "You're confirmed ✓",
    confirmedBody: "We have your confirmation on record. See you then.",
    closedTitle: "This visit is no longer open",
    closedBody: "It may already be complete or cancelled. Reply to the message from the business if you need to change anything.",
    errorTitle: "We couldn't confirm that",
    errorBody: "Please reply to the message from the business and they'll sort it out.",
    footer: "Powered by CUE — The Heart of Your Business",
  },
  es: {
    tag: "es-US",
    eyebrow: "Confirmación de visita",
    prepared: "Para",
    prompt: "Confirme esta visita para que el equipo pueda planificar el día. Es solo un clic.",
    confirm: "Confirmar mi visita",
    confirmedTitle: "Confirmado ✓",
    confirmedBody: "Tenemos su confirmación registrada. Nos vemos pronto.",
    closedTitle: "Esta visita ya no está abierta",
    closedBody: "Puede que ya se haya completado o cancelado. Responda al mensaje del negocio si necesita cambiar algo.",
    errorTitle: "No pudimos confirmar",
    errorBody: "Responda al mensaje del negocio y ellos lo resolverán.",
    footer: "Con la tecnología de CUE — The Heart of Your Business",
  },
  vi: {
    tag: "vi-VN",
    eyebrow: "Xác nhận lịch hẹn",
    prepared: "Dành cho",
    prompt: "Vui lòng xác nhận lịch hẹn để đội ngũ chuẩn bị. Chỉ cần một lần nhấn.",
    confirm: "Xác nhận lịch hẹn",
    confirmedTitle: "Đã xác nhận ✓",
    confirmedBody: "Chúng tôi đã ghi nhận xác nhận của quý khách. Hẹn gặp lại.",
    closedTitle: "Lịch hẹn này không còn mở",
    closedBody: "Lịch hẹn có thể đã hoàn tất hoặc bị hủy. Vui lòng trả lời tin nhắn của doanh nghiệp nếu cần thay đổi.",
    errorTitle: "Không thể xác nhận",
    errorBody: "Vui lòng trả lời tin nhắn của doanh nghiệp để được hỗ trợ.",
    footer: "Được hỗ trợ bởi CUE — The Heart of Your Business",
  },
  ar: {
    tag: "ar",
    eyebrow: "تأكيد الموعد",
    prepared: "لـ",
    prompt: "يرجى تأكيد هذا الموعد حتى يتمكن الفريق من التخطيط لليوم. الأمر يستغرق نقرة واحدة.",
    confirm: "تأكيد موعدي",
    confirmedTitle: "تم التأكيد ✓",
    confirmedBody: "لدينا تأكيدك في السجل. نراك في الموعد.",
    closedTitle: "هذا الموعد لم يعد مفتوحًا",
    closedBody: "قد يكون مكتملًا أو ملغيًا. رد على رسالة النشاط التجاري إذا كنت بحاجة إلى تغيير أي شيء.",
    errorTitle: "لم نتمكن من التأكيد",
    errorBody: "يرجى الرد على رسالة النشاط التجاري وسيتولون الأمر.",
    footer: "مدعوم بواسطة CUE — The Heart of Your Business",
  },
};

function localeFor(raw: unknown): keyof typeof COPY {
  return typeof raw === "string" && raw in COPY ? raw : "en";
}

export default async function ConfirmAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ confirmed?: string; error?: string }>;
}) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const sp = await searchParams;

  const [row] = (await sql`
    select ac.status as confirmation_status, ac.sent_at, ac.confirmed_at,
           a.title, a.scheduled_for, a.arrival_window_minutes, a.status as appointment_status,
           c.name as customer_name, c.preferred_locale,
           o.name as organization_name,
           coalesce(nullif(bp.timezone, ''), 'America/Chicago') as timezone
    from appointment_confirmations ac
    join appointments a on a.id = ac.appointment_id
    join customers c on c.id = a.customer_id
    join organizations o on o.id = ac.organization_id
    left join business_profiles bp on bp.organization_id = ac.organization_id
    where ac.token = ${token}`) as unknown as [{
      confirmation_status: string; sent_at: Date | null; confirmed_at: Date | null;
      title: string; scheduled_for: Date; arrival_window_minutes: number | null; appointment_status: string;
      customer_name: string; preferred_locale: string | null;
      organization_name: string; timezone: string;
    } | undefined];
  if (!row) notFound();

  const locale = localeFor(row.preferred_locale);
  const copy = COPY[locale];
  const when = new Intl.DateTimeFormat(copy.tag, {
    timeZone: row.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(row.scheduled_for));
  const confirmed = Boolean(row.confirmed_at);
  const closed = row.appointment_status !== "SCHEDULED";
  const error = sp.error === "closed" || sp.error === "save";

  return (
    <div
      className="min-h-screen bg-[#0b0b18] text-white"
      dir={locale === "ar" ? "rtl" : undefined}
      style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
    >
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-violet-300">
          {row.organization_name} · {copy.eyebrow}
        </div>
        <h1 className="text-2xl font-bold">{row.title}</h1>
        <p className="mt-2 text-sm text-[#8b93b8]">
          {copy.prepared} {row.customer_name} · {when}
        </p>
        {row.arrival_window_minutes ? (
          <p className="mt-1 text-sm text-[#8b93b8]">
            {arrivalWindowLabel(locale, row.arrival_window_minutes)}
          </p>
        ) : null}

        {closed || error ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#141428] p-6">
            <div className="text-lg font-semibold">{closed ? copy.closedTitle : copy.errorTitle}</div>
            <p className="mt-2 text-sm text-[#8b93b8]">{closed ? copy.closedBody : copy.errorBody}</p>
          </div>
        ) : confirmed ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-[#141428] p-6">
            <div className="text-lg font-semibold text-emerald-300">{copy.confirmedTitle}</div>
            <p className="mt-2 text-sm text-[#8b93b8]">{copy.confirmedBody}</p>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#141428] p-6">
            <p className="text-sm text-[#8b93b8]">{copy.prompt}</p>
            <form action={confirmAppointmentByToken} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button className="rounded-full bg-violet-500 px-6 py-3 text-sm font-bold text-[#0b0b18] hover:bg-violet-400">
                {copy.confirm}
              </button>
            </form>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-[#6b7396]">{copy.footer}</p>
      </div>
    </div>
  );
}
