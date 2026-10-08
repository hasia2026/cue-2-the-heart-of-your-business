"use client";

import { useActionState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { resetPasswordAction, type ResetFormState } from "@/app/signin/reset-actions";

const initialState: ResetFormState = { error: null };

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form className="mt-4 space-y-4" action={formAction}>
      {state.error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</div>
      )}
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </button>
      <p className="muted text-center text-xs">
        <a href="/signin" className="text-cue-blue hover:underline">Back to sign in</a>
      </p>
    </form>
  );
}
