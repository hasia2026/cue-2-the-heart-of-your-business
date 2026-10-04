import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Inverted "navy" scale for the CUE-style dark UI:
        // navy-900..600 (text tones) → light text; navy-100/50 (surfaces) → dark glass.
        navy: {
          50: "rgba(148,163,184,0.07)",
          100: "rgba(148,163,184,0.14)",
          200: "rgba(148,163,184,0.22)",
          300: "#64748b",
          400: "#94a3b8",
          500: "#b6c2d4",
          600: "#c7d2e2",
          700: "#d7e0ec",
          800: "#e6edf6",
          900: "#f1f5fb",
          950: "#f8fafc",
        },
        // Deep space background scale
        ink: {
          700: "#1b2337",
          800: "#141a2b",
          900: "#0e1322",
          950: "#070b16",
        },
        accent: {
          blue: "#3b82f6",
          purple: "#8b5cf6",
          orange: "#f97316",
          green: "#10b981",
          red: "#ef4444",
          amber: "#f59e0b",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.45)",
        raised: "0 4px 24px rgba(0,0,0,0.6)",
        glow: "0 0 24px rgba(59,130,246,0.35)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
