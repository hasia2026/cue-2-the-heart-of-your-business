import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";
import { signInAction } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { reset } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">Welcome back</h1>
        <p className="page-sub mb-6">Sign in to CUE — the heart of your business.</p>
        <form action={signInAction} className="space-y-4">
          {reset === "sent" && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              If that email has an account, a single-use reset link is on its way (valid 60 minutes).
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <p className="muted mt-2 text-center text-xs">
          <a href="/forgot-password" className="text-cue-blue hover:underline">Forgot your password?</a>
        </p>
        <p className="muted mt-4 text-center">
          New here? <a href="/signup" className="text-cue-blue hover:underline">Create your company</a>
        </p>
      </div>
    </div>
  );
}
