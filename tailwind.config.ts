import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep-space backgrounds — driven by CSS vars so the light/dark toggle
        // can re-map the whole palette (see :root / html.light in globals.css)
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        // Text neutrals (lavender-tinted)
        navy: {
          900: "rgb(var(--navy-900) / <alpha-value>)",
          700: "rgb(var(--navy-700) / <alpha-value>)",
          500: "rgb(var(--navy-500) / <alpha-value>)",
          300: "rgb(var(--navy-300) / <alpha-value>)",
          100: "rgb(var(--navy-100) / <alpha-value>)",
          50: "rgb(var(--navy-50) / <alpha-value>)",
        },
        cue: {
          blue: "#38BDF8", // neon cyan — Capture
          purple: "#A855F7", // violet — Understand / brand core
          orange: "#FB923C", // warm neon — Execute
          red: "#F87171",
          green: "#34D399",
          yellow: "#FBBF24",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.45), 0 12px 32px -12px rgb(0 0 0 / 0.55)",
        glow: "0 0 28px -6px rgb(139 92 246 / 0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
