"use client";

import { useEffect, useState } from "react";

// Light/dark switch — available to every signed-in role. Persists in
// localStorage; the no-flash script in the root layout applies it pre-paint.
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("cue-theme", next ? "light" : "dark");
    } catch {
      // Private mode — the choice just won't persist this session.
    }
  }

  return (
    <button
      onClick={toggle}
      className="btn-ghost !px-3 !py-1.5 text-xs"
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
    >
      {light ? "☾ Dark" : "☀ Light"}
    </button>
  );
}
