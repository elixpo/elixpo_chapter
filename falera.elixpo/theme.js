// Single source of truth for the Falera brand palette + spacing tokens.
// Imported by Tailwind config and by any component that needs runtime
// access to a colour (e.g. Framer Motion variants).
//
// Keep this file framework-neutral — plain JS, no imports — so it can
// also be loaded directly by Tailwind's CommonJS resolver and by a
// future server-side renderer without bundler help.

const theme = {
  colors: {
    // Surfaces — the Elixpo Research paper page with the sponsor deck's
    // cards (pitch-deck/style.css): white cards with a 1px grey-green
    // border, and a light fill (--card in the deck) for secondary blocks.
    bg:         "#FBFBF8",
    bgRaised:   "#EFF1ED",
    card:       "#FFFFFF",
    cardSubtle: "#F6F7F4",
    border:     "#D7DBD6",

    // Brand — Falera red (the deck's --red / --red-dim, Lumi's bow).
    // One accent per block: numbers, labels and one emphasis.
    primary:    "#C93A45",
    primaryDim: "#A92F39",

    // Accent ladder, matched to the research site's green, gold and blue.
    teal:       "#0B623C",
    gold:       "#9A6400",
    lilac:      "#3A65C7",

    // Text — research ink on paper.
    text:       "#142018",
    textBody:   "#2A352E",
    textDim:    "#555C58",
    muted:      "#5F6962",
    mutedDeep:  "#9AA39D",
  },

  // Radii. `card` is every card and panel; `inner` is a block inside a
  // card (an option button, a code block); `pill` is buttons and chips.
  radius: {
    sm: "4px",
    md: "8px",
    lg: "16px",
    inner: "0.75rem",
    card: "1.25rem",
    pill: "999px",
  },

  // The repo + canonical brand URLs, surfaced in the header / footer.
  links: {
    github:  "https://github.com/elixpo/falera",
    discord: "",
    docs:    "https://falera.elixpo.com/docs",
  },
};

module.exports = theme;
