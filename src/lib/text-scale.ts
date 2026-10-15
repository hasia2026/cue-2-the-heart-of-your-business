// Text-size accessibility: one root font-size scale applied to <html> in the
// root layout (server-rendered from a cookie, so no flash and no hydration
// mismatch). Everything rem-sized in Tailwind (titles, body text, inputs)
// scales with the root. Default is LARGE — most business owners using CUE
// are 45+ and smaller text is the #1 adoption complaint for them.
export const TEXT_SCALE_COOKIE = "cue-text-scale";

export type TextScale = "std" | "lg" | "xl" | "xxl";

// std = today's size, lg = 12.5% bigger (the new default), xl = 25%,
// xxl = 40% (roughly 18px body text — easy reading without zoom).
export const TEXT_SCALES: Record<TextScale, { label: string; pct: number; hint: string }> = {
  std: { label: "Standard", pct: 100, hint: "Original compact size" },
  lg: { label: "Large", pct: 112.5, hint: "Comfortable default" },
  xl: { label: "Extra large", pct: 125, hint: "Easy reading" },
  xxl: { label: "Huge", pct: 140, hint: "No squinting" },
};

export const DEFAULT_TEXT_SCALE: TextScale = "lg";

export function isTextScale(v: unknown): v is TextScale {
  return typeof v === "string" && v in TEXT_SCALES;
}

export function getTextScalePercent(v: unknown): number {
  return isTextScale(v) ? TEXT_SCALES[v].pct : TEXT_SCALES[DEFAULT_TEXT_SCALE].pct;
}
