"use client";

/**
 * Page canvas. The editorial system is flat paper (no glow); `docs`/`auth`
 * add research's faint dot grid in the top-right corner for texture.
 * Kept as a component so every shell shares one background.
 */
type Variant = "default" | "auth" | "warm" | "docs";

export default function BackgroundAurora({ variant = "default" }: { variant?: Variant }) {
    const dotted = variant === "auth" || variant === "docs";
    return (
        <div
            aria-hidden
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                background: "var(--app-bg)",
                ...(dotted
                    ? {
                          backgroundImage:
                              "radial-gradient(circle at center, var(--app-art-line) 1px, transparent 1.5px)",
                          backgroundSize: "22px 22px",
                          maskImage: "radial-gradient(ellipse at top right, #000, transparent 55%)",
                          WebkitMaskImage: "radial-gradient(ellipse at top right, #000, transparent 55%)",
                          opacity: 0.45,
                      }
                    : {}),
            }}
        />
    );
}
