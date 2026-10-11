import PublicHeader from "@/components/PublicHeader";
import ForgotPasswordForm from "./ForgotForm";

export const metadata = {
  title: "Reset your password — CUE",
};

export default function ForgotPasswordPage() {
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">Reset your password</h1>
        <p className="page-sub mb-6">
          Enter your work email and we'll send a single-use reset link (valid 60 minutes).
        </p>
        <ForgotPasswordForm />
        <p className="muted mt-4 text-center">
          <a href="/signin" className="text-cue-blue hover:underline">Back to sign in</a>
        </p>
      </div>
    </div>
    </>
  );
}
