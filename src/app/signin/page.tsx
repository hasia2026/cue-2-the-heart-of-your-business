import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import PasswordInput from "@/components/PasswordInput";
import PublicHeader from "@/components/PublicHeader";
import { signInAction } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { reset, error } = await searchParams;
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">{t("signin.title")}</h1>
        <p className="page-sub mb-6">{t("signin.sub")}</p>
        <form action={signInAction} className="space-y-4">
          {reset === "sent" && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {t("signin.resetSent")}
            </div>
          )}
          {error === "1" && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {t("signin.invalid")}
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">{t("signin.email")}</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">{t("signin.password")}</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full">{t("signin.submit")}</button>
        </form>
        <p className="muted mt-2 text-center text-xs">
          <a href="/forgot-password" className="text-cue-blue hover:underline">{t("signin.forgot")}</a>
        </p>
        <p className="muted mt-4 text-center">
          {t("signin.newPrompt")} <a href="/signup" className="text-cue-blue hover:underline">{t("signin.createCompany")}</a>
        </p>
      </div>
    </div>
    </>
  );
}
