import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#050914",
          900: "#0A1020",
          800: "#101830",
          700: "#182242",
          600: "#243056",
        },
        navy: {
          900: "#0D1B2E",
          700: "#1E3A5F",
          500: "#3E6B99",
          300: "#8FB3D1",
          100: "#D7E7F5",
          50: "#EEF6FC",
        },
        cue: {
          blue: "#2E8BFF",
          purple: "#8B5CF6",
          orange: "#F97316",
          red: "#EF4444",
          green: "#10B981",
          yellow: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.28), 0 8px 24px -8px rgb(0 0 0 / 0.4)",
        glow: "0 0 24px -4px rgb(46 139 255 / 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
