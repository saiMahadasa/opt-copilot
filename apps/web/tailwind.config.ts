import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-body)",    "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        caption: ["0.8125rem", { lineHeight: "1.4" }],
        small:   ["0.875rem",  { lineHeight: "1.5" }],
        body:    ["1rem",      { lineHeight: "1.55" }],
        h3:      ["1.125rem",  { lineHeight: "1.4"  }],
        h2:      ["1.375rem",  { lineHeight: "1.3"  }],
        h1:      ["1.75rem",   { lineHeight: "1.2"  }],
        display: ["2.5rem",    { lineHeight: "1.05", letterSpacing: "-0.01em" }],
      },
      colors: {
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        teal:        "hsl(var(--teal))",
        brand:       "hsl(var(--brand))",
        gold:        "hsl(var(--gold))",
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input:  "hsl(var(--input))",
        ring:   "hsl(var(--ring))",
        ok: {
          DEFAULT: "hsl(var(--ok))",
          bg:      "hsl(var(--ok-bg))",
        },
        watch: {
          DEFAULT: "hsl(var(--watch))",
          bg:      "hsl(var(--watch-bg))",
        },
        over: {
          DEFAULT: "hsl(var(--over))",
          bg:      "hsl(var(--over-bg))",
        },
      },
      borderRadius: {
        hero:  "20px",
        lg:    "var(--radius)",
        md:    "calc(var(--radius) - 2px)",
        sm:    "calc(var(--radius) - 6px)",
        stamp: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
