"use client";

import { useState } from "react";

// Password field with a show/hide reveal — used on sign-in and sign-up.
export default function PasswordInput({
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} {...props} type={show ? "text" : "password"} className="input pe-16" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute end-2 top-1/2 -translate-y-1/2 text-xs font-medium text-navy-300 hover:text-white"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
