/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      // Every colour resolves to a token in src/styles/theme.css, so the whole
      // app re-themes from one place.
      colors: {
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          4: "var(--ink-4)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          wash: "var(--accent-wash)",
          ink: "var(--accent-ink)",
        },
        safe: { DEFAULT: "var(--safe)", wash: "var(--safe-wash)" },
        warn: { DEFAULT: "var(--warn)", wash: "var(--warn-wash)" },
        risk: { DEFAULT: "var(--risk)", wash: "var(--risk-wash)" },
        glass: {
          DEFAULT: "var(--glass)",
          strong: "var(--glass-strong)",
          soft: "var(--glass-soft)",
          border: "var(--glass-border)",
        },
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        pill: "var(--r-pill)",
      },
      boxShadow: {
        soft: "var(--shadow-sm)",
        glass: "var(--shadow-md)",
        panel: "var(--shadow-lg)",
        float: "var(--shadow-float)",
      },
      backdropBlur: {
        glass: "28px",
      },
      transitionTimingFunction: {
        spatial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      maxWidth: {
        shell: "1240px",
      },
    },
  },
  plugins: [],
};
