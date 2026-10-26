"use client";

import { Box } from "@mui/material";

type Variant = "default" | "auth" | "warm" | "docs";

// Dot colors for the two orbit rings and the accent blob, per surface.
const PALETTES: Record<Variant, [string, string, string]> = {
    default: ["#3f7cec", "#e76043", "#f3b529"],
    auth: ["#3f7cec", "#f3b529", "#cbdcff"],
    warm: ["#e76043", "#3f7cec", "#f3b529"],
    docs: ["#3f7cec", "#0b623c", "#dfd0f3"],
};

interface Props {
    variant?: Variant;
}

/**
 * Fixed decorative layer in the research.elixpo style: thin orbit rings
 * carrying colored dots, a soft blob, and a faded dot grid. Purely
 * ornamental and ignored by assistive tech.
 */
const BackgroundAurora = ({ variant = "default" }: Props) => {
    const [a, b, c] = PALETTES[variant];

    return (
        <Box
            aria-hidden
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                overflow: "hidden",
                background: "var(--bg)",
            }}
        >
            <Box
                className="dot-grid"
                sx={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0.35,
                    maskImage:
                        "radial-gradient(ellipse at 85% 10%, #000 0%, transparent 55%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse at 85% 10%, #000 0%, transparent 55%)",
                }}
            />
            <Box
                component="span"
                className="orbit"
                sx={{
                    width: { xs: 320, md: 520 },
                    height: { xs: 320, md: 520 },
                    right: { xs: -180, md: -160 },
                    top: { xs: -120, md: -140 },
                    "--dot": a,
                    "&::after": { left: "18%", bottom: "12%" },
                    animation: "auroraDriftA 30s ease-in-out infinite",
                }}
            />
            <Box
                component="span"
                className="orbit"
                sx={{
                    width: { xs: 220, md: 300 },
                    height: { xs: 220, md: 300 },
                    left: { xs: -130, md: -120 },
                    bottom: { xs: -120, md: -110 },
                    "--dot": b,
                    "&::after": { right: 30, top: 32 },
                    animation: "auroraDriftB 36s ease-in-out infinite",
                }}
            />
            <Box
                component="span"
                className="blob"
                sx={{
                    display: { xs: "none", md: "block" },
                    width: 150,
                    height: 150,
                    right: "6%",
                    bottom: "12%",
                    borderRadius: "48% 52% 35% 65%",
                    background: c,
                    opacity: 0.32,
                    transform: "rotate(18deg)",
                    boxShadow: "none",
                }}
            />
        </Box>
    );
};

export default BackgroundAurora;
