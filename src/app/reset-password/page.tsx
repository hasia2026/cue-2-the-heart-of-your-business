import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/locale";
import PasswordInput from "@/components/PasswordInput";
import PublicHeader from "@/components/PublicHeader";
import ResetPasswordForm from "./ResetForm";

export const metadata = {
  title: "Set a new password — CUE",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { token } = await searchParams;
  const { t } = await getT();

  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">{t("reset.title")}</h1>
        {token ? (
          <ResetPasswordForm
            token={token}
            passwordLabel={t("reset.password")}
            confirmLabel={t("reset.confirm")}
            submitLabel={t("reset.submit")}
            savingLabel={t("reset.saving")}
            backLabel={t("forgot.back")}
          />
        ) : (
          <p className="muted mt-2 text-sm">
            {t("reset.missingToken")}{" "}
            <a href="/forgot-password" className="text-cue-blue hover:underline">{t("reset.missingTokenLink")}</a>.
          </p>
        )}
      </div>
    </div>
    </>
  );
}
