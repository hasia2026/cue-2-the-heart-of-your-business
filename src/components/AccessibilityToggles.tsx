"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { A11Y_PREFS, type A11yKey } from "@/lib/accessibility";

/** Sibling of the text-size setting: three on/off accessibility toggles.
 *  State lives in readable cookies so the root layout applies the html
 *  classes server-side (no flash), and router.refresh() re-render lets the
 *  server pick the change up immediately. */
export default function AccessibilityToggles() {
  const router = useRouter();
  const [on, setOn] = useState<Record<A11yKey, boolean>>({
    reduceMotion: false,
    contrast: false,
    focus: false,
  });

  useEffect(() => {
    try {
      setOn({
        reduceMotion: document.cookie.includes(`${A11Y_PREFS.reduceMotion.cookie}=1`),
        contrast: document.cookie.includes(`${A11Y_PREFS.contrast.cookie}=1`),
        focus: document.cookie.includes(`${A11Y_PREFS.focus.cookie}=1`),
      });
    } catch {
      // Private mode — defaults apply this session.
    }
  }, []);

  function toggle(key: A11yKey) {
    const next = !on[key];
    setOn((s) => ({ ...s, [key]: next }));
    try {
      document.cookie = `${A11Y_PREFS[key].cookie}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Ignore — the toggle still flips visually for this session.
    }
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      {(Object.keys(A11Y_PREFS) as A11yKey[]).map((key) => (
        <button
          key={key}
          onClick={() => toggle(key)}
          aria-pressed={on[key]}
          className={`${on[key] ? "btn-primary" : "btn-ghost"} !justify-start !px-4 !py-2.5 text-left text-sm`}
          title={A11Y_PREFS[key].label + (on[key] ? " — on, click to turn off" : " — off, click to turn on")}
        >
          {on[key] ? "✓" : "○"} <span className="font-medium">{A11Y_PREFS[key].label}</span>
          <span className="text-xs opacity-70"> — {A11Y_PREFS[key].desc}</span>
        </button>
      ))}
    </div>
  );
}
