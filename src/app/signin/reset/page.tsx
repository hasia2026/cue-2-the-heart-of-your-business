import { getT } from "@/lib/locale";
import Link from "next/link";
import { resetPassword } from "../reset-actions";

const ERRORS: Record<string, string> = {
  invalid: "That reset link isn't valid. Request a new one — links expire after 30 minutes.",
  short: "New password must be at least 8 characters.",
  mismatch: "The two passwords didn't match.",
  used: "That link was already used or is outdated. Request a fresh one.",
};

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
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
          {ERRORS[error ?? ""] ? (
            <>
              <h1 className="text-lg font-semibold text-navy-900 mb-2">Link problem</h1>
              <p className="muted mb-4">{ERRORS[error ?? ""]}</p>
              <Link href="/signin/forgot" className="btn-primary text-sm">Request a new link</Link>
            </>
          ) : token ? (
            <>
              <h1 className="text-lg font-semibold text-navy-900 mb-1">Choose a new password</h1>
              <p className="muted mb-6">You'll be signed straight in afterwards.</p>
              <form action={resetPassword} className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <div>
                  <label htmlFor="password" className="label">New password</label>
                  <input id="password" name="password" type="password" required minLength={8} className="input mt-1" autoComplete="new-password" />
                </div>
                <div>
                  <label htmlFor="confirm" className="label">Confirm new password</label>
                  <input id="confirm" name="confirm" type="password" required minLength={8} className="input mt-1" autoComplete="new-password" />
                </div>
                <button className="btn-primary w-full py-2.5">Set password & sign in</button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-navy-900 mb-2">Missing link</h1>
              <p className="muted mb-4">This page needs a reset link from your email.</p>
              <Link href="/signin/forgot" className="btn-primary text-sm">Request one</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
