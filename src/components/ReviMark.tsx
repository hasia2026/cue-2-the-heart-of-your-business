// Revi — CUE's butterfly mascot. The wings carry the brand gradient
// (cyan → violet → warm orange) and the body is the pulse line: the
// "heart of your business." Reused across landing, footer, and chat.
export default function ReviMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="revi-l" x1="6" y1="14" x2="30" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
        <linearGradient id="revi-r" x1="58" y1="14" x2="34" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FB923C" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      {/* Left wing — Capture→Understand gradient */}
      <path
        d="M30 30 C22 12, 6 12, 7 24 C8 34, 20 40, 30 36 Z M30 34 C20 38, 10 46, 16 52 C22 56, 30 46, 31 38 Z"
        fill="url(#revi-l)"
        opacity="0.92"
      />
      {/* Right wing — Execute→Expand gradient */}
      <path
        d="M34 30 C42 12, 58 12, 57 24 C56 34, 44 40, 34 36 Z M34 34 C44 38, 54 46, 48 52 C42 56, 34 46, 33 38 Z"
        fill="url(#revi-r)"
        opacity="0.92"
      />
      {/* Body — the pulse at the center */}
      <rect x="30.6" y="18" width="2.8" height="30" rx="1.4" fill="#E7E4F8" />
      <circle cx="32" cy="15.5" r="3.2" fill="#FDBA74" />
    </svg>
  );
}
