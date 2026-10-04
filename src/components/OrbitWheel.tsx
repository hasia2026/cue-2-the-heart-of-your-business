"use client";

// CUE Orbit — the signature CUE-style command center visual.
// An orbital wheel where each node is a CUE module; the ring's
// data (node intensity, health arc) is computed from REAL business
// data passed in from the server. Pure CSS/SVG — no canvas deps.

const MODULES: { key: string; label: string; color: string; href: string }[] = [
  { key: "capture", label: "Capture", color: "#3b82f6", href: "/capture" },
  { key: "knowledge", label: "Knowledge", color: "#8b5cf6", href: "/knowledge" },
  { key: "people", label: "People", color: "#a78bfa", href: "/people" },
  { key: "training", label: "Training", color: "#7c3aed", href: "/expand" },
  { key: "brand", label: "Brand Studio", color: "#f97316", href: "/enhance" },
  { key: "automations", label: "Automations", color: "#fb923c", href: "/execute" },
  { key: "ecosystem", label: "Ecosystem", color: "#38bdf8", href: "/ecosystem" },
  { key: "execute", label: "Execute", color: "#60a5fa", href: "/execute" },
];

export default function OrbitWheel({
  healthScore,
  activity,
}: {
  healthScore: number | null;
  activity: Record<string, number>;
}) {
  const size = 560;
  const c = size / 2;
  const ringR = 190;
  const nodeR = 34;

  const maxAct = Math.max(1, ...Object.values(activity));
  const position = (i: number, total: number) => {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    return { x: c + ringR * Math.cos(angle), y: c + ringR * Math.sin(angle) };
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Orbit rings */}
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#070b16" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="healthArc" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>

        <circle cx={c} cy={c} r={160} fill="url(#coreGlow)" />
        <circle cx={c} cy={c} r={ringR} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" strokeDasharray="3 6" />
        <circle cx={c} cy={c} r={ringR - 46} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        <circle cx={c} cy={c} r={ringR + 46} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />

        {/* Health arc */}
        {healthScore !== null && (
          <circle
            cx={c} cy={c} r={ringR - 24}
            fill="none"
            stroke="url(#healthArc)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(healthScore / 100) * 2 * Math.PI * (ringR - 24)} ${2 * Math.PI * (ringR - 24)}`}
            transform={`rotate(-90 ${c} ${c})`}
            opacity="0.9"
          />
        )}

        {/* Connector lines between adjacent nodes */}
        {MODULES.map((m, i) => {
          const a = position(i, MODULES.length);
          const b = position((i + 1) % MODULES.length, MODULES.length);
          return (
            <line
              key={m.key}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(148,163,184,0.18)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
          );
        })}
      </svg>

      {/* Center core */}
      <div className="absolute flex flex-col items-center justify-center text-center" style={{ width: 200, height: 200 }}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-navy-400">Business Health</div>
        <div className="text-5xl font-bold bg-gradient-to-r from-accent-blue via-accent-purple to-accent-orange bg-clip-text text-transparent mt-1">
          {healthScore ?? "—"}
        </div>
        <div className="text-xs text-navy-400 mt-1">Company Compass</div>
      </div>

      {/* Module nodes */}
      {MODULES.map((m, i) => {
        const { x, y } = position(i, MODULES.length);
        const intensity = (activity[m.key] ?? 0) / maxAct;
        const glow = 0.25 + intensity * 0.75;
        return (
          <a
            key={m.key}
            href={m.href}
            className="absolute flex flex-col items-center group"
            style={{ left: x - nodeR, top: y - nodeR - 8, width: nodeR * 2 }}
          >
            <div
              className="h-[68px] w-[68px] rounded-full border flex items-center justify-center text-xl transition-transform group-hover:scale-110"
              style={{
                borderColor: `${m.color}${Math.round(glow * 255).toString(16).padStart(2, "0")}`,
                boxShadow: `0 0 ${8 + intensity * 22}px ${m.color}${Math.round(glow * 140).toString(16).padStart(2, "0")}, inset 0 0 12px ${m.color}22`,
                background: `radial-gradient(circle at 50% 35%, ${m.color}2e, rgba(7,11,22,0.9))`,
              }}
            >
              <span style={{ color: m.color, filter: `drop-shadow(0 0 6px ${m.color}aa)` }}>
                {nodeIcon(m.key)}
              </span>
            </div>
            <span className="mt-1.5 text-xs text-navy-500 group-hover:text-navy-800 transition-colors whitespace-nowrap">
              {m.label}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function nodeIcon(key: string): string {
  const icons: Record<string, string> = {
    capture: "⤓",
    knowledge: "❑",
    people: "◍",
    training: "🎓",
    brand: "✎",
    automations: "⚙",
    ecosystem: "⇄",
    execute: "▶",
  };
  return icons[key] ?? "◈";
}
