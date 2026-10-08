import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";
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

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">Set a new password</h1>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="muted mt-2 text-sm">
            This link is missing its token. Request a fresh one from the{" "}
            <a href="/forgot-password" className="text-cue-blue hover:underline">password reset page</a>.
          </p>
        )}
      </div>
    </div>
  );
}
