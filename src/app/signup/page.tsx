import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import PasswordInput from "@/components/PasswordInput";
import PublicHeader from "@/components/PublicHeader";
import { signUpAction } from "@/app/signin/actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { ref } = await searchParams;
  const refCode = (ref ?? "").trim().toUpperCase().slice(0, 24) || null;
  return (
    <>
    <PublicHeader />
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-7">
        <h1 className="page-title">Create your company</h1>
        <p className="page-sub mb-6">CUE starts learning your business the moment you sign up.</p>
        {refCode && (
          <div className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-xs text-violet-200">
            Partner link detected — code <span className="font-semibold">{refCode}</span> will be credited at signup.
          </div>
        )}
        <input type="hidden" name="ref" value={refCode ?? ""} />
        <form action={signUpAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="orgName">Company name</label>
            <input id="orgName" name="orgName" required className="input" placeholder="Northgate Auto Group" />
          </div>
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" required className="input" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password (8+ characters)</label>
            <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
          </div>
          <button className="btn-primary w-full">Create company</button>
        </form>
        <p className="muted mt-4 text-center">
          Already have an account? <a href="/signin" className="text-cue-blue hover:underline">Sign in</a>
        </p>
      </div>
    </div>
    </>
  );
}
