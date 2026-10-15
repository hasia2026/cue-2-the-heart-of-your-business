"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEXT_SCALE_COOKIE, TEXT_SCALES, type TextScale } from "@/lib/text-scale";

const ORDER: TextScale[] = ["std", "lg", "xl", "xxl"];

/** Read the current scale from the cookie (mirrors the server default). */
function currentScale(): TextScale {
  try {
    const m = document.cookie.match(/(?:^|; )cue-text-scale=(\w{3,4})/);
    if (m && m[1] in TEXT_SCALES) return m[1] as TextScale;
  } catch {
    // Ignore — default applies.
  }
  return "lg";
}

function save(scale: TextScale) {
  // Readable cookie (like locale), one year, so the root layout can pick it
  // up server-side on the refresh below.
  document.cookie = `${TEXT_SCALE_COOKIE}=${scale}; path=/; max-age=31536000; samesite=lax`;
}

export default function TextSizePicker({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<TextScale>("lg");

  // Sync to the stored preference after mount; SSR renders "lg" (the
  // default), then the server-rendered html already carries the right size
  // from the cookie — this only affects the highlighted button.
  useEffect(() => {
    setActive(currentScale());
  }, []);

  if (compact) {
    // Header quick control: cycles Standard → Large → XL → Huge → Standard.
    return (
      <button
        className="btn-ghost !px-3 !py-1.5 text-xs"
        title={`Text size: ${TEXT_SCALES[active].label} — click to change`}
        aria-label={`Text size: ${TEXT_SCALES[active].label} — click to change`}
        onClick={() => {
          const next = ORDER[(ORDER.indexOf(active) + 1) % ORDER.length];
          setActive(next);
          save(next);
          router.refresh();
        }}
      >
        Aa <span className="text-navy-300">{TEXT_SCALES[active].label}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ORDER.map((s) => (
        <button
          key={s}
          onClick={() => { setActive(s); save(s); router.refresh(); }}
          className={`${s === active ? "btn-primary" : "btn-ghost"} !px-3 !py-1.5 text-xs`}
          title={TEXT_SCALES[s].hint}
        >
          Aa {TEXT_SCALES[s].label}
        </button>
      ))}
    </div>
  );
}
