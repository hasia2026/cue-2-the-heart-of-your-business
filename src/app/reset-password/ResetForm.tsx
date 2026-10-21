"use client";

import { useActionState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { resetPasswordAction, type ResetFormState } from "@/app/signin/reset-actions";

const initialState: ResetFormState = { error: null };

export default function ResetPasswordForm({
  token,
  passwordLabel,
  confirmLabel,
  submitLabel,
  savingLabel,
  backLabel,
}: {
  token: string;
  passwordLabel: string;
  confirmLabel: string;
  submitLabel: string;
  savingLabel: string;
  backLabel: string;
}) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form className="mt-4 space-y-4" action={formAction}>
      {state.error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{state.error}</div>
      )}
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">{passwordLabel}</label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{confirmLabel}</label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? savingLabel : submitLabel}
      </button>
      <p className="muted text-center text-xs">
        <a href="/signin" className="text-cue-blue hover:underline">{backLabel}</a>
      </p>
    </form>
  );
}
