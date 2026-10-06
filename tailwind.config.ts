import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep-space backgrounds (violet-tinted near-black, like the brand deck)
        ink: {
          950: "#050113",
          900: "#0B0721",
          800: "#130B30",
          700: "#1C1244",
          600: "#2A1D5E",
        },
        // Text neutrals (lavender-tinted)
        navy: {
          900: "#171233",
          700: "#2A2255",
          500: "#5B4FA8",
          300: "#A79FD4",
          100: "#E7E4F8",
          50: "#F4F2FD",
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
