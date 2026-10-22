// Public service-plan sign-up page (spec §2) — no session, org-branded,
// styled after the quote/digest email cards so the brand already carried in
// the email is the brand the customer lands on. Featured plans first; works
// with JS off (progressive-enhancement form, radio plan picker).
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { planSignup } from "./actions";

type Plan = { id: string; name: string; blurb: string | null; annual_value: number; visits_per_year: number | null; featured: boolean };

const L: Record<string, Record<string, string>> = {
  en: {
    eyebrow: "Service plans",
    heading: "Protect your home or fleet, year-round",
    sub: "Pick a maintenance plan and leave the surprise breakdowns to us.",
    pick: "Choose your plan",
    perYear: "/year",
    reqLabel: "Request this plan",
    name: "Your name",
    email: "Email",
    phone: "Phone",
    address: "Address (optional)",
    message: "Anything we should know? (optional)",
    submit: "Sign up",
    doneHead: "Request received!",
    doneBody: "We'll confirm your plan start date by phone or email within one business day.",
    errContact: "Please add a valid email or phone so we can reach you.",
    errName: "Please add your name.",
    errPlan: "That plan is no longer offered — pick another.",
    errRate: "Hang on a second — too many attempts, try again in a few minutes.",
  },
  es: {
    eyebrow: "Planes de servicio",
    heading: "Proteja su hogar o flota todo el año",
    sub: "Elija un plan de mantenimiento y déjenos las averías sorpresa.",
    pick: "Elija su plan",
    perYear: "/año",
    reqLabel: "Solicitar este plan",
    name: "Su nombre",
    email: "Correo",
    phone: "Teléfono",
    address: "Dirección (opcional)",
    message: "¿Algo que debamos saber? (opcional)",
    submit: "Registrarse",
    doneHead: "¡Solicitud recibida!",
    doneBody: "Confirmaremos la fecha de inicio por teléfono o correo dentro de un día hábil.",
    errContact: "Agregue un correo o teléfono válido para poder contactarle.",
    errName: "Agregue su nombre.",
    errPlan: "Ese plan ya no está disponible — elija otro.",
    errRate: "Espere un momento — demasiados intentos, vuelva a intentarlo en unos minutos.",
  },
  ar: {
    eyebrow: "خطط الخدمة",
    heading: "حماية منزلك أو أسطولك على مدار العام",
    sub: "اختر خطة صيانة واترك أعطال الصدمات لنا.",
    pick: "اختر خطتك",
    perYear: "/سنة",
    reqLabel: "اطلب هذه الخطة",
    name: "اسمك",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    address: "العنوان (اختياري)",
    message: "أي شيء يجب أن نعرفه؟ (اختياري)",
    submit: "التسجيل",
    doneHead: "تم استلام الطلب!",
    doneBody: "سنؤكد تاريخ بدء خطتك عبر الهاتف أو البريد خلال يوم عمل واحد.",
    errContact: "أضف بريدًا إلكترونيًا أو هاتفًا صالحًا حتى نتمكن من الوصول إليك.",
    errName: "أضف اسمك.",
    errPlan: "هذه الخطة لم تعد متاحة — اختر خطة أخرى.",
    errRate: "انتظر لحظة — محاولات كثيرة جدًا، حاول مرة أخرى بعد دقائق.",
  },
  vi: {
    eyebrow: "Gói dịch vụ",
    heading: "Bảo vệ ngôi nhà hoặc đội xe quanh năm",
    sub: "Chọn gói bảo trì và để những lần hư hỏng bất ngờ cho chúng tôi.",
    pick: "Chọn gói của bạn",
    perYear: "/năm",
    reqLabel: "Đăng ký gói này",
    name: "Tên của bạn",
    email: "Email",
    phone: "Điện thoại",
    address: "Địa chỉ (không bắt buộc)",
    message: "Điều gì chúng tôi nên biết? (không bắt buộc)",
    submit: "Đăng ký",
    doneHead: "Đã nhận yêu cầu!",
    doneBody: "Chúng tôi sẽ xác nhận ngày bắt đầu qua điện thoại hoặc email trong vòng một ngày làm việc.",
    errContact: "Vui lòng thêm email hoặc số điện thoại hợp lệ để chúng tôi có thể liên hệ.",
    errName: "Vui lòng thêm tên của bạn.",
    errPlan: "Gói đó không còn được cung cấp — chọn gói khác.",
    errRate: "Xin chờ vài phút — quá nhiều lần thử, vui lòng thử lại sau.",
  },
};

function strings(lang: string) {
  return L[lang] ?? L.en;
}

export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ done?: string; err?: string; src?: string; lang?: string; ref?: string }>;
}) {
  const { orgId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound();
  const [org] = await sql`select name from organizations where id = ${orgId}`;
  if (!org) notFound();

  const sp = await searchParams;
  const lang = ["en", "es", "ar", "vi"].includes(sp.lang ?? "") ? sp.lang! : "en";
  const t = strings(lang);
  const src = sp.src === "quote" || sp.src === "digest" ? sp.src : "";
  const srcRef = (sp.ref ?? "").slice(0, 64);

  const profile = await getWorkspaceProfile(orgId);
  const brand = profile.brandNameOverride || (org?.name as string) || "CUE";
  const accent = /^#[0-9a-fA-F]{6}$/.test(profile.brandAccent ?? "") ? profile.brandAccent! : "#7c6cff";
  const logo = profile.brandLogoUrl;
  const contactBits = [profile.brandContactPhone, profile.brandContactEmail].filter(Boolean).join(" · ");

  const rows = await sql`
    select id, name, blurb, annual_value, visits_per_year, featured
    from service_plans
    where organization_id = ${orgId} and active = true
    order by featured desc, position asc, name asc`;
  const plans = rows as unknown as Plan[];

  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ERR_KEYS: Record<string, string> = { contact: "errContact", name: "errName", plan: "errPlan", rate: "errRate" };
  const stringsAll = t as Record<string, string>;
  const err = sp.err ? stringsAll[ERR_KEYS[sp.err] ?? "errContact"] : null;

  const ThankYou = (
    <div className="mx-auto mt-16 max-w-md text-center" dir={lang === "ar" ? "rtl" : undefined}>
      <div className="card p-8">
        <div className="text-4xl">✅</div>
        <h1 className="page-title mt-3">{t.doneHead}</h1>
        <p className="page-sub">{t.doneBody}</p>
        {contactBits && <p className="muted mt-2 text-sm">{esc(contactBits)}</p>}
      </div>
    </div>
  );
  if (sp.done) return <div className="mx-auto max-w-3xl px-4 py-10">{ThankYou}</div>;

  const banner = (
    <header className="mb-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src={logo} alt="" className="mx-auto mb-4 block max-h-16 max-w-[220px] object-contain" />}
      <div className="eyebrow" style={{ color: accent }}>{esc(brand)} · {t.eyebrow}</div>
      <h1 className="page-title">{t.heading}</h1>
      <p className="page-sub">{t.sub}</p>
    </header>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10" dir={lang === "ar" ? "rtl" : undefined}>
      {banner}

      {err && <p className="badge badge-orange mb-4 block text-center">{err}</p>}

      {plans.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="muted">{esc(brand)} hasn&apos;t published plans yet — check back soon or call {contactBits ? contactBits.split(" · ")[0] : "us"}.</p>
        </div>
      ) : (
        <form action={planSignup} className="space-y-6">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="src" value={src} />
          <input type="hidden" name="srcRef" value={srcRef} />

          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t.pick}>
            {plans.map((p, i) => (
              <label key={p.id} className="card cursor-pointer p-5 has-[:checked]:ring-2 has-[:checked]:ring-violet-400/60">
                <input type="radio" name="planId" value={p.id} defaultChecked={i === 0} className="peer sr-only" />
                <div className="flex items-center gap-2">
                  {p.featured && <span className="badge badge-blue ms-auto">★</span>}
                </div>
                <div className="mt-1 text-lg font-bold text-white">{esc(p.name)}</div>
                {p.blurb && <p className="muted mt-1 text-sm">{esc(p.blurb)}</p>}
                <div className="mt-3">
                  <span className="text-2xl font-bold" style={{ color: accent }}>{money(Number(p.annual_value))}</span>
                  <span className="muted text-sm">{t.perYear}</span>
                  {p.visits_per_year != null && <span className="muted text-sm"> · {p.visits_per_year} {lang === "en" ? "visits/yr" : lang === "es" ? "visitas/año" : lang === "ar" ? "زيارة/سنة" : "lần/năm"}</span>}
                </div>
              </label>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="section-title mb-3">{t.reqLabel}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="label">{t.name}</span>
                <input name="name" required maxLength={120} className="input" autoComplete="name" />
              </label>
              <label>
                <span className="label">{t.email}</span>
                <input name="email" type="email" maxLength={200} className="input" autoComplete="email" />
              </label>
              <label>
                <span className="label">{t.phone}</span>
                <input name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
              </label>
              <label className="md:col-span-2">
                <span className="label">{t.address}</span>
                <input name="address" maxLength={200} className="input" autoComplete="street-address" />
              </label>
              <label className="md:col-span-2">
                <span className="label">{t.message}</span>
                <textarea name="message" rows={2} maxLength={1000} className="input" />
              </label>
            </div>
            <button className="btn-primary mt-4 w-full md:w-auto">{t.submit} →</button>
            <p className="muted mt-2 text-xs">
              {esc(brand)} reviews every request by hand — nothing is charged today.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
