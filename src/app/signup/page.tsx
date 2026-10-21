import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import PasswordInput from "@/components/PasswordInput";
import PublicHeader from "@/components/PublicHeader";
import { signUpAction } from "@/app/signin/actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { ref } = await searchParams;
  const refCode = (ref ?? "").trim().toUpperCase().slice(0, 24) || null;
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">{t("signup.title")}</h1>
        <p className="page-sub mb-6">{t("signup.sub")}</p>
        <form action={signUpAction} className="space-y-4">
          {refCode && (
            <div className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-xs text-violet-200">
              {t("signup.partnerRef")} <span className="font-semibold">{refCode}</span> {t("signup.partnerRefTail")}
            </div>
          )}
          <input type="hidden" name="ref" value={refCode ?? ""} />
          <div>
            <label className="label" htmlFor="orgName">{t("signup.company")}</label>
            <input id="orgName" name="orgName" required className="input" placeholder="Northgate Auto Group" />
          </div>
          <div>
            <label className="label" htmlFor="industry">{t("signup.industry")}</label>
            <select id="industry" name="industry" required defaultValue="" className="input">
              <option value="" disabled>{t("signup.chooseIndustry")}</option>
              <option value="AUTO_DEALERSHIP">{t("signup.ind.auto")}</option>
              <option value="HOME_SERVICES">{t("signup.ind.home")}</option>
              <option value="RETAIL">{t("signup.ind.retail")}</option>
              <option value="SALON">{t("signup.ind.salon")}</option>
              <option value="OTHER">{t("signup.ind.other")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="name">{t("signup.name")}</label>
            <input id="name" name="name" required className="input" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">{t("signup.email")}</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">{t("signup.password")}</label>
            <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
          </div>
          <button className="btn-primary w-full">{t("signup.submit")}</button>
        </form>
        <p className="muted mt-4 text-center">
          {t("signup.haveAccount")} <a href="/signin" className="text-cue-blue hover:underline">{t("signup.signIn")}</a>
        </p>
      </div>
    </div>
    </>
  );
}
