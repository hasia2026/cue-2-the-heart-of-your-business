import { getT } from "@/lib/locale";
import PublicHeader from "@/components/PublicHeader";
import ForgotPasswordForm from "./ForgotForm";

export const metadata = {
  title: "Reset your password — CUE",
};

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">{t("forgot.title")}</h1>
        <p className="page-sub mb-6">{t("forgot.sub")}</p>
        <ForgotPasswordForm emailLabel={t("forgot.email")} submitLabel={t("forgot.submit")} sendingLabel={t("forgot.sending")} />
        <p className="muted mt-4 text-center">
          <a href="/signin" className="text-cue-blue hover:underline">{t("forgot.back")}</a>
        </p>
      </div>
    </div>
    </>
  );
}
