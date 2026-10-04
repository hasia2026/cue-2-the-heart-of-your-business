import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale, getT } from "@/lib/locale";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { signUp } from "./actions";

export default async function SignUpPage({
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
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-orange text-white font-bold text-xl flex items-center justify-center shadow-glow">B</div>
          <div>
            <div className="text-xl font-bold text-navy-900">CUE</div>
            <div className="text-xs text-navy-500">{t("app.tagline")}</div>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-lg font-semibold text-navy-900 mb-1">{t("app.signUp")}</h1>
          <p className="muted mb-6">Start with an empty company. You&apos;ll tell CUE about your business next.</p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form action={signUp} className="space-y-4">
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" name="name" required minLength={2} className="input" placeholder="e.g. Sam Rivera" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="email">{t("app.email")}</label>
              <input id="email" name="email" type="email" required className="input" placeholder="you@yourcompany.com" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("app.password")}</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
            <button type="submit" className="btn-primary w-full">Create workspace</button>
          </form>

          <p className="text-center text-sm text-navy-400 mt-6">
            Already have an account?{" "}
            <Link href="/signin" className="text-accent-blue hover:underline">{t("app.signIn")}</Link>
          </p>
        </div>

        <div className="mt-6">
          <LanguageSwitcher current={locale} />
        </div>

        <p className="text-center text-xs text-navy-500 mt-6">
          Your workspace starts empty — no demo data. Capture real information to make CUE&apos;s intelligence your own.
        </p>
      </div>
    </div>
  );
}
