"use client";

import { useState } from "react";
import { useActionState } from "react";
import { changePassword } from "../signin/reset-actions";

type State = { ok?: boolean; error?: string } | null;

export default function ChangePasswordClient() {
  const [state, action, pending] = useActionState<State, FormData>(changePassword, null);
  const [show, setShow] = useState(false);

  return (
    <section className="card p-5">
      <h2 className="section-title mb-3">Your password</h2>
      {state?.ok && (
        <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-xs px-3 py-2">
          Password updated. All existing reset links are now invalid.
        </div>
      )}
      {state?.error && (
        <div className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 text-red-300 text-xs px-3 py-2">
          {state.error}
        </div>
      )}
      {show ? (
        <form action={action} className="space-y-3 max-w-sm">
          <input name="current" type="password" required placeholder="Current password" className="input" autoComplete="current-password" />
          <input name="next" type="password" required minLength={8} placeholder="New password (8+ characters)" className="input" autoComplete="new-password" />
          <input name="confirm" type="password" required minLength={8} placeholder="Confirm new password" className="input" autoComplete="new-password" />
          <div className="flex gap-2">
            <button disabled={pending} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
              {pending ? "Saving…" : "Update password"}
            </button>
            <button type="button" onClick={() => setShow(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShow(true)} className="btn-ghost text-sm">Change password…</button>
      )}
    </section>
  );
}
