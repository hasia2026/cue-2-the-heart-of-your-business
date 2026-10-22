"use client";

// Submit button for the public signup form — spinner while the server action
// runs (useFormStatus only works in a child of the submitting <form>), so a
// double-click can't double-submit and the user sees progress.
import { useFormStatus } from "react-dom";

export default function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary mt-4 w-full md:w-auto"
      aria-busy={pending}
    >
      {pending && (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {label} {!pending && "→"}
    </button>
  );
}
