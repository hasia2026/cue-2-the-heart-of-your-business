// Workspace Studio module registry — single source of truth for sidebar nav,
// per-org enabled/label overrides, and route guards. A module key maps to the
// sidebar item href; renames never change paths.

export type ModuleKey =
  | "dashboard"
  | "intake"
  | "capture"
  | "signals"
  | "understand"
  | "compass"
  | "knowledge"
  | "enhance"
  | "execute"
  | "pipeline"
  | "report"
  | "people"
  | "expand"
  | "lab"
  | "ecosystem"
  | "settings";

export type ModuleDef = {
  key: ModuleKey;
  href: string;
  defaultLabel: string; // English fallback; localization layers on top
};

export const MODULES: ModuleDef[] = [
  { key: "dashboard", href: "/dashboard", defaultLabel: "Dashboard" },
  { key: "intake", href: "/intake", defaultLabel: "Intake" },
  { key: "capture", href: "/capture", defaultLabel: "Capture" },
  { key: "signals", href: "/signals", defaultLabel: "Signals" },
  { key: "understand", href: "/understand", defaultLabel: "Understand" },
  { key: "compass", href: "/compass", defaultLabel: "Compass" },
  { key: "knowledge", href: "/knowledge", defaultLabel: "Knowledge" },
  { key: "enhance", href: "/enhance", defaultLabel: "Enhance" },
  { key: "execute", href: "/execute", defaultLabel: "Execute" },
  { key: "pipeline", href: "/pipeline", defaultLabel: "Pipeline" },
  { key: "report", href: "/report", defaultLabel: "Report" },
  { key: "people", href: "/people", defaultLabel: "People" },
  { key: "expand", href: "/expand", defaultLabel: "Expand" },
  { key: "lab", href: "/lab", defaultLabel: "Lab" },
  { key: "ecosystem", href: "/ecosystem", defaultLabel: "Ecosystem" },
  { key: "settings", href: "/settings", defaultLabel: "Settings" },
];

// dashboard and settings can never be hidden — dashboard is the fallback
// route, and settings is the escape hatch that re-enables everything else.
export const FIXED_MODULES: ModuleKey[] = ["dashboard", "settings"];

export function isModule(m: string): m is ModuleKey {
  return MODULES.some((x) => x.key === m);
}

export function moduleHref(key: ModuleKey): string {
  return MODULES.find((x) => x.key === key)?.href ?? "/";
}

/** Path→module for route guarding: longest href prefix wins (e.g. /pipeline/unscheduled → pipeline). */
export function moduleForPath(path: string): ModuleKey | null {
  const hits = MODULES.filter((m) => path === m.href || path.startsWith(m.href + "/"));
  if (!hits.length) return null;
  return hits.sort((a, b) => b.href.length - a.href.length)[0].key;
}
