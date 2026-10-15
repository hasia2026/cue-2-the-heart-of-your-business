// Accessibility preferences beyond text size: reduce motion, high
// contrast, and strong focus outlines. One readable cookie per toggle
// ("1" = on, anything else = off), applied to <html> classes in the root
// layout server-side so the first paint is already correct — the same
// no-flash pattern as text-scale.
export type A11yKey = "reduceMotion" | "contrast" | "focus";

export const A11Y_PREFS: Record<
  A11yKey,
  { cookie: string; cssClass: string; label: string; desc: string }
> = {
  reduceMotion: {
    cookie: "cue-reduce-motion",
    cssClass: "a11y-reduce-motion",
    label: "Reduce motion",
    desc: "Stops animations, transitions, and smooth scrolling — helpful for vestibular sensitivity.",
  },
  contrast: {
    cookie: "cue-contrast",
    cssClass: "a11y-contrast",
    label: "High contrast",
    desc: "Brighter text on dark surfaces, stronger borders, and underlined links.",
  },
  focus: {
    cookie: "cue-focus-outline",
    cssClass: "a11y-strong-focus",
    label: "Strong focus outlines",
    desc: "A thick, high-visibility outline on whatever is keyboard-focused.",
  },
};

const A11Y_ORDER: A11yKey[] = ["reduceMotion", "contrast", "focus"];

/** Which html classes to add, given a cookie jar accessor. */
export function activeA11yClasses(
  getCookieValue: (name: string) => string | undefined,
): string[] {
  return A11Y_ORDER.filter((k) => getCookieValue(A11Y_PREFS[k].cookie) === "1").map(
    (k) => A11Y_PREFS[k].cssClass,
  );
}
