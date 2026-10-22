"use client";

// Full-catalog emoji picker for the Ambassador avatar (any emoji, searchable,
// every Unicode species group with skin tones and a frequently-used row).
// The picker JS itself is dynamically imported, so pages that don't open the
// popover pay nothing for it. A hidden input carries the chosen value so
// existing server actions are untouched; a "type instead" path stays for
// pasting rare glyphs.
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const Picker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <div className="muted p-3 text-xs">Loading emoji catalog…</div>,
});

export default function EmojiPicker({
  name,
  defaultValue = "",
  placeholder = "🦋",
  label = "Avatar emoji",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click — Escape still works because the popover holds
  // focusable controls (search input) natively.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="input flex w-full items-center gap-2 text-left"
      >
        <span className="text-xl leading-none">{value || placeholder}</span>
        <span className="muted ms-auto text-xs">{value ? "Change" : "Choose emoji"}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Emoji picker" className="absolute z-40 mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl">
          <Picker
            onEmojiClick={(d) => { setValue(d.emoji as string); setOpen(false); }}
            theme="dark"
            width={340}
            height={380}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
      <button type="button" onClick={() => setTyping((t) => !t)} className="muted mt-1 text-[11px] underline">
        {typing ? "hide direct input" : "type instead…"}
      </button>
      {typing && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 32))}
          className="input mt-1 text-sm"
          aria-label="Type an emoji directly"
        />
      )}
    </div>
  );
}
