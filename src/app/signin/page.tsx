import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signInAction } from "./actions";

export default async function SignInPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">Welcome back</h1>
        <p className="page-sub mb-6">Sign in to CUE — the heart of your business.</p>
        <form action={signInAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <p className="muted mt-4 text-center">
          New here? <a href="/signup" className="text-cue-blue hover:underline">Create your company</a>
        </p>
      </div>
    </div>
  );
}
