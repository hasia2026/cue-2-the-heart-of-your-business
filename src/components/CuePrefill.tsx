"use client";

/**
 * One-tap shortcut that opens the type-what-you-want bar with a sentence
 * already written (customer + property of the job you're on). The bar still
 * parses it into a draft — nothing is written until Confirm — so a tech
 * two taps away from "log the follow-up" never retypes the address.
 */
export default function CuePrefillButton({
  text,
  label = "⌘ Follow up",
  className = "btn-ghost !px-2 !py-1 text-[11px]",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      title={`Pre-fills the command bar: “${text}”`}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("cue:command-open", { detail: { text: text.slice(0, 300) } }),
        )
      }
    >
      {label}
    </button>
  );
}
