import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale, getT } from "@/lib/locale";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { signIn } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const { error } = await searchParams;
  const t = await getT();
  const locale = await getLocale();

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
          <h1 className="text-lg font-semibold text-navy-900 mb-1">{t("app.signIn")}</h1>
          <p className="muted mb-6">Everything your business knows. One intelligent system.</p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error === "invalid"
              ? "That email or password didn't match."
              : error === "slow"
                ? "Too many attempts — wait a minute and try again."
                : "Something went wrong. Try again."}
            </div>
          )}

          <form action={signIn} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">{t("app.email")}</label>
              <input id="email" name="email" type="email" required className="input" placeholder="you@company.com" defaultValue="owner@summithome.demo" />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("app.password")}</label>
              <input id="password" name="password" type="password" required className="input" defaultValue="demo1234" />
            </div>
            <button type="submit" className="btn-primary w-full">{t("app.signInCta")}</button>
            <div className="text-center text-xs">
              <a href="/signin/forgot" className="text-blue-300 hover:underline">Forgot password?</a>
            </div>
          </form>

          <div className="mt-6 rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-xs text-navy-500">
            <span className="font-semibold text-navy-800">Demo workspace:</span> Summit Home Services is pre-loaded with realistic data. Sign in with the prefilled credentials — or change them to explore the invalid-credentials path.
          </div>
        </div>

        <div className="mt-6">
          <LanguageSwitcher current={locale} />
        </div>

        <p className="text-center text-xs text-navy-400 mt-6">
          CUE never makes consequential decisions on its own — intelligence is always backed by evidence and human approval.
        </p>
      </div>
    </div>
  );
}
