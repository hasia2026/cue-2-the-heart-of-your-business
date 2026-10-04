import { getT } from "@/lib/locale";
import Link from "next/link";
import { requestPasswordReset } from "../reset-actions";

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; devlink?: string }>;
}) {
  const { sent, devlink } = await searchParams;
  const t = await getT();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-950 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(59,130,246,0.14)_0%,transparent_60%),radial-gradient(50rem_40rem_at_100%_100%,rgba(139,92,246,0.12)_0%,transparent_55%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-white font-bold text-xl flex items-center justify-center shadow-raised">B</div>
          <div>
            <div className="text-xl font-bold text-navy-900">CUE</div>
            <div className="text-xs text-navy-500">{t("app.tagline")}</div>
          </div>
        </div>

        <div className="card p-8">
          {sent ? (
            <>
              <h1 className="text-lg font-semibold text-navy-900 mb-2">Check your email</h1>
              <p className="muted mb-4">
                If an account exists for that address, a reset link is on its way. The link expires in 30 minutes and works once.
              </p>
              {devlink && (
                <div className="rounded-xl border border-navy-50 bg-ink-950/60 p-3 mb-4">
                  <div className="text-[11px] text-navy-300 mb-1">Dev mode — no email provider configured, link shown here:</div>
                  <a href={devlink} className="text-xs text-blue-300 break-all hover:underline">{devlink}</a>
                </div>
              )}
              <Link href="/signin" className="btn-ghost text-sm">{t("app.signIn")} →</Link>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-navy-900 mb-1">Forgot your password?</h1>
              <p className="muted mb-6">Enter your work email and we'll send you a reset link.</p>
              <form action={requestPasswordReset} className="space-y-4">
                <div>
                  <label htmlFor="email" className="label">{t("app.email")}</label>
                  <input id="email" name="email" type="email" required className="input mt-1" placeholder="you@company.com" />
                </div>
                <button className="btn-primary w-full py-2.5">Send reset link</button>
              </form>
              <div className="text-center text-sm text-navy-400 mt-5">
                <Link href="/signin" className="hover:text-navy-700">← Back to {t("app.signIn")}</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
