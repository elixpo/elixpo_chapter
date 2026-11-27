import type { Config } from "tailwindcss";
// theme.js is the single source of truth for brand tokens; Tailwind
// just re-exposes them as utility classes (bg-bg, text-primary, etc).
// Newer Next.js loads tailwind.config.ts via the native ESM loader,
// which doesn't expose `require` — use a static import instead.
import theme from "./theme.js";

/* The layout system (see globals.css for the component classes):
 *
 *   container   .container-page  max 1200px, gutters 16 / 24 / 32px
 *   rhythm      .section         py 64 / 80 / 96px between sections
 *   reading     max-w-prose-site 42rem for body copy and Markdown
 *   type        text-display, text-title, text-lede (below)
 *
 * Pages use these instead of hand-rolled margins. */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand-token utilities (hand-written components use these)
        bg:           theme.colors.bg,
        "bg-raised":  theme.colors.bgRaised,
        card:         theme.colors.card,
        "card-sub":   theme.colors.cardSubtle,
        border:       theme.colors.border,
        primary:      theme.colors.primary,
        "primary-dim":theme.colors.primaryDim,
        teal:         theme.colors.teal,
        gold:         theme.colors.gold,
        lilac:        theme.colors.lilac,
        text:         theme.colors.text,
        "text-body":  theme.colors.textBody,
        "text-dim":   theme.colors.textDim,
        muted:        theme.colors.muted,
        "muted-deep": theme.colors.mutedDeep,

        // CSS-variable aliases, kept for the converter and Markdown output.
        // The accent of the current section tone (red on paper, a lighter
        // red on ink, deep red on the red tint, green on the green tint).
        accent:               "var(--accent)",
        "red-tint":           "#FBE9EA",
        "green-tint":         "#E5F0E8",
        ink:                  theme.colors.text,
        background:           "var(--background)",
        foreground:           "var(--foreground)",
      },
      borderRadius: {
        sm:    theme.radius.sm,
        md:    theme.radius.md,
        lg:    theme.radius.lg,
        inner: theme.radius.inner,
        card:  theme.radius.card,
        pill:  theme.radius.pill,
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "ui-sans-serif", "system-ui", "-apple-system",
               "Segoe UI", "Roboto", "sans-serif"],
        serif: ["Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas",
               "monospace"],
        display: ["Arial", "Helvetica", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // One type scale. Headings use these three sizes only; body copy is
      // text-base / text-sm, labels are .eyebrow.
      fontSize: {
        display: ["clamp(2.25rem, 1.6rem + 3.2vw, 4rem)",  { lineHeight: "1.04", letterSpacing: "-0.04em" }],
        title:   ["clamp(1.75rem, 1.4rem + 1.6vw, 2.625rem)", { lineHeight: "1.1", letterSpacing: "-0.035em" }],
        lede:    ["clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)", { lineHeight: "1.65" }],
      },
      maxWidth: {
        page: "75rem",
        "prose-site": "42rem",
      },
    },
  },
  plugins: [],
};

export default config;
