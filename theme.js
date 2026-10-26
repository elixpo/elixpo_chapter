// Shared design tokens (research.elixpo design language). Tailwind reads
// these through tailwind.config.ts (CommonJS so the config loader needs no
// ESM reparse); client code that draws outside the DOM
// (charts, canvas, QR rendering) can import them directly.
const palette = {
    paper: "#fbfbf8",
    paperDeep: "#eff1ed",
    paperSoft: "#f5f6f2",
    ink: "#142018",
    inkSoft: "#24372b",
    muted: "#5f6962",
    line: "#d7dbd6",
    blue: "#3a65c7",
    blueDeep: "#2f56b0",
    blueWash: "#dce7ff",
    green: "#0b623c",
    orange: "#e76043",
    danger: "#b42318",
    pastel: {
        yellow: "#f1c64f",
        blue: "#cbdcff",
        purple: "#dfd0f3",
        mint: "#d4eadf",
        sand: "#f3dfb5",
        lilac: "#eef2ff",
    },
};

const fonts = {
    sans: "Arial, Helvetica, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const radii = { pill: "999px", card: "1.4rem", panel: "1.2rem" };

module.exports = { palette, fonts, radii };
