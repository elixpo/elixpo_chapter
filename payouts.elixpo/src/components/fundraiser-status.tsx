"use client";

import { Box } from "@mui/material";

const TONES: Record<string, { label: string; color: string; pulse?: boolean; strike?: boolean }> = {
    draft: { label: "Draft", color: "var(--app-warn)" },
    live: { label: "Live", color: "var(--app-success)", pulse: true },
    closed: { label: "Closed", color: "var(--app-fg-muted)" },
    held: { label: "Held", color: "var(--app-danger)" },
    deleted: { label: "Deleted", color: "var(--app-fg-faint)", strike: true },
};

/** Status chip for fundraisers — Draft / Live / Closed / Held / Deleted. */
export default function FundraiserStatusChip({ status }: { status: string }) {
    const t = TONES[status] ?? { label: status, color: "var(--app-fg-muted)" };
    return (
        <Box
            component="span"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.6,
                px: 1.1,
                py: 0.25,
                borderRadius: "999px",
                fontSize: "0.72rem",
                fontWeight: 700,
                lineHeight: 1.6,
                whiteSpace: "nowrap",
                color: t.color,
                background: `color-mix(in srgb, ${t.color} 11%, transparent)`,
                border: `1px solid color-mix(in srgb, ${t.color} 30%, transparent)`,
                textDecoration: t.strike ? "line-through" : "none",
            }}
        >
            <Box
                component="span"
                aria-hidden
                sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: t.color,
                    ...(t.pulse
                        ? {
                              boxShadow: `0 0 0 0 ${t.color}`,
                              animation: "fr-chip-pulse 1.8s ease-out infinite",
                              "@keyframes fr-chip-pulse": {
                                  "0%": { boxShadow: `0 0 0 0 color-mix(in srgb, ${t.color} 60%, transparent)` },
                                  "100%": { boxShadow: "0 0 0 7px transparent" },
                              },
                              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                          }
                        : {}),
                }}
            />
            {t.label}
        </Box>
    );
}
