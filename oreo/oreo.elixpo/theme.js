// Single source of truth for the Oreo brand palette + spacing tokens.
// Imported by Tailwind config and by any component that needs runtime
// access to a colour (e.g. Framer Motion variants).
//
// Keep this file framework-neutral — plain JS, no imports — so it can
// also be loaded directly by Tailwind's CommonJS resolver and by a
// future server-side renderer without bundler help.

const theme = {
  colors: {
    // Surfaces — the Elixpo Research paper palette: warm off-white page,
    // white cards, and a slightly deeper wash for inset panels.
    bg:         "#FBFBF8",
    bgRaised:   "#EFF1ED",
    card:       "#FFFFFF",
    cardSubtle: "#EFF1ED",
    border:     "#D7DBD6",

    // Brand — Oreo pink-red, deepened so it stays readable on paper.
    primary:    "#C93A45",
    primaryDim: "#A92F39",

    // Accent ladder, matched to the research site's green, gold and blue.
    teal:       "#0B623C",
    gold:       "#9A6400",
    lilac:      "#3A65C7",

    // Text — research ink on paper.
    text:       "#142018",
    textDim:    "#555C58",
    muted:      "#5F6962",
    mutedDeep:  "#9AA39D",
  },

  // Radii / spacing — matches the badge's UI to keep visual continuity.
  radius: {
    sm: "4px",
    md: "8px",
    lg: "16px",
    pill: "999px",
  },

  // Motion presets. Imported by components that need a consistent
  // springiness across the site — keeping these centralised avoids
  // the "every animation feels slightly different" problem.
  motion: {
    softSpring:   { type: "spring", stiffness: 220, damping: 24 },
    crispSpring:  { type: "spring", stiffness: 340, damping: 28 },
    easeOut:      { type: "tween",  ease: [0.16, 1, 0.3, 1], duration: 0.55 },
    fastEaseOut:  { type: "tween",  ease: [0.16, 1, 0.3, 1], duration: 0.28 },
  },

  // The repo + canonical brand URLs, surfaced in the header / footer.
  links: {
    github:  "https://github.com/elixpo/oreo",
    discord: "",
    docs:    "https://oreo.elixpo.com/docs",
  },
};

module.exports = theme;
