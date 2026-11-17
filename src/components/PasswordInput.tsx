"use client";

import { useState } from "react";
import { useLocale } from "./useLocale";

// Password field with a show/hide reveal — used on sign-in and sign-up.
export default function PasswordInput({
  id,
  showLabel,
  hideLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; showLabel?: string; hideLabel?: string }) {
  const [show, setShow] = useState(false);
  const { t } = useLocale();
  // Server pages can pass the translated labels so the first paint is already
  // correct; client-only callers still get the locale-aware fallback.
  const label = show ? (hideLabel ?? t("auth.hide")) : (showLabel ?? t("auth.show"));
  return (
    <div className="relative">
      <input id={id} {...props} type={show ? "text" : "password"} className="input pe-16" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={label}
        aria-pressed={show}
        className="absolute end-2 top-1/2 -translate-y-1/2 text-xs font-medium text-navy-300 hover:text-white"
      >
        {label}
      </button>
    </div>
  );
}
