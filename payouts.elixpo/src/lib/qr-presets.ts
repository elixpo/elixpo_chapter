// QR style catalog for fundraiser share codes (same model as lixrl.com's
// studio). `import type` is erased at compile time, so qr-code-styling — a
// browser-only library — is never evaluated on the edge.
import type { Options } from "qr-code-styling";

type DotType = "square" | "dots" | "rounded" | "extra-rounded" | "classy" | "classy-rounded";
type CornerSquareType = "dot" | "square" | "extra-rounded";
type CornerDotType = "dot" | "square";

interface Gradient {
    type: "linear" | "radial";
    rotation?: number;
    colorStops: { offset: number; color: string }[];
}
type Paint = { color: string } | { gradient: Gradient };

export interface QrPreset {
    id: string;
    name: string;
    dotsType: DotType;
    cornersSquareType: CornerSquareType;
    cornersDotType: CornerDotType;
    fg: Paint;
    bg: string;
    /** Card frame colours for the branded export. */
    frame: { bg: string; ink: string; muted: string; accent: string };
    /** CSS swatch for the picker. */
    swatch: string;
}

function grad(rotation: number, ...colors: string[]): Gradient {
    return {
        type: "linear",
        rotation,
        colorStops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
    };
}

const PAPER = { bg: "#fbfbf8", ink: "#142018", muted: "#5f6962", accent: "#3a65c7" };

// Every preset keeps strong dark/light contrast so the code still scans.
export const QR_PRESETS: QrPreset[] = [
    {
        id: "elixpo",
        name: "Elixpo",
        dotsType: "rounded",
        cornersSquareType: "extra-rounded",
        cornersDotType: "dot",
        fg: { color: "#142018" },
        bg: "#ffffff",
        frame: PAPER,
        swatch: "#142018",
    },
    {
        id: "forest",
        name: "Forest",
        dotsType: "classy-rounded",
        cornersSquareType: "extra-rounded",
        cornersDotType: "dot",
        fg: { gradient: grad(45, "#0b623c", "#14532d") },
        bg: "#ffffff",
        frame: { bg: "#eef7f1", ink: "#0b3d26", muted: "#4d6b5a", accent: "#0b623c" },
        swatch: "linear-gradient(135deg,#0b623c,#14532d)",
    },
    {
        id: "ocean",
        name: "Ocean",
        dotsType: "dots",
        cornersSquareType: "dot",
        cornersDotType: "dot",
        fg: { gradient: grad(45, "#2c4fa3", "#3a65c7") },
        bg: "#ffffff",
        frame: { bg: "#eef2ff", ink: "#1b2f66", muted: "#4f5b7d", accent: "#3a65c7" },
        swatch: "linear-gradient(135deg,#2c4fa3,#3a65c7)",
    },
    {
        id: "sunset",
        name: "Sunset",
        dotsType: "extra-rounded",
        cornersSquareType: "extra-rounded",
        cornersDotType: "dot",
        fg: { gradient: grad(45, "#c2410c", "#be123c") },
        bg: "#ffffff",
        frame: { bg: "#fff4ec", ink: "#5a1d0b", muted: "#7a5546", accent: "#c2410c" },
        swatch: "linear-gradient(135deg,#c2410c,#be123c)",
    },
    {
        id: "classic",
        name: "Classic",
        dotsType: "square",
        cornersSquareType: "square",
        cornersDotType: "square",
        fg: { color: "#000000" },
        bg: "#ffffff",
        frame: { bg: "#ffffff", ink: "#000000", muted: "#555555", accent: "#000000" },
        swatch: "#000000",
    },
    {
        id: "classy",
        name: "Classy",
        dotsType: "classy",
        cornersSquareType: "square",
        cornersDotType: "square",
        fg: { color: "#1f2937" },
        bg: "#ffffff",
        frame: PAPER,
        swatch: "#1f2937",
    },
    {
        id: "ink",
        name: "Ink",
        dotsType: "rounded",
        cornersSquareType: "extra-rounded",
        cornersDotType: "dot",
        fg: { color: "#ffffff" },
        bg: "#142018",
        frame: { bg: "#142018", ink: "#ffffff", muted: "#b5c0b8", accent: "#f0ad16" },
        swatch: "linear-gradient(135deg,#142018,#2a3a2f)",
    },
];

export const DEFAULT_PRESET_ID = "elixpo";

export function getPreset(id: string | null | undefined): QrPreset {
    return QR_PRESETS.find((p) => p.id === id) ?? QR_PRESETS[0];
}

function cornerColor(fg: Paint): string {
    return "gradient" in fg ? fg.gradient.colorStops[0].color : fg.color;
}

/** Preset (+ data, optional centre logo) → qr-code-styling options. */
export function buildQrOptions(preset: QrPreset, opts: { data: string; image?: string; size: number }): Options {
    const corner = cornerColor(preset.fg);
    return {
        width: opts.size,
        height: opts.size,
        type: "svg",
        data: opts.data,
        image: opts.image || undefined,
        margin: 0,
        // H-level error correction keeps it scannable with a centre logo.
        qrOptions: { errorCorrectionLevel: opts.image ? "H" : "Q" },
        dotsOptions: { type: preset.dotsType, ...preset.fg },
        cornersSquareOptions: { type: preset.cornersSquareType, color: corner },
        cornersDotOptions: { type: preset.cornersDotType, color: corner },
        backgroundOptions: { color: preset.bg },
        imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.32, hideBackgroundDots: true },
    };
}
