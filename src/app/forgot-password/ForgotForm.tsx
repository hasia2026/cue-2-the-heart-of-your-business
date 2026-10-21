"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ResetFormState } from "@/app/signin/reset-actions";

const initialState: ResetFormState = { error: null };

export default function ForgotPasswordForm({
  emailLabel,
  submitLabel,
  sendingLabel,
}: {
  emailLabel: string;
  submitLabel: string;
  sendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      {state.error && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">{emailLabel}</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? sendingLabel : submitLabel}
      </button>
    </form>
  );
}
