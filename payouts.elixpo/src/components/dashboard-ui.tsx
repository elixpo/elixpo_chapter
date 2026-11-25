"use client";

import { Box, Typography } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import type React from "react";

/** Surface tokens — reference the CSS theme variables so they flip light/dark. */
export const SURFACE = "var(--app-surface)";
export const SURFACE_HOVER = "var(--app-surface-2)";
export const BORDER = "var(--app-border)";

/** Build the MUI theme for the dashboard in either mode. */
export function makeDashboardTheme(mode: "light" | "dark") {
    return createTheme({
        palette: {
            mode,
            primary: { main: mode === "dark" ? "#79a7ff" : "#3a65c7" },
            // Concrete colors (not CSS vars): MUI runs decomposeColor/alpha on
            // palette values internally and throws on var(...). The theme is
            // rebuilt per-mode via makeDashboardTheme, so these track the toggle.
            background: {
                default: mode === "dark" ? "#0e1511" : "#fbfbf8",
                paper: mode === "dark" ? "#152019" : "#ffffff",
            },
            text: {
                primary: mode === "dark" ? "#eef1ec" : "#142018",
                secondary:
                    mode === "dark" ? "#a3ada6" : "#5f6962",
            },
            // Concrete color (not a CSS var): MUI runs alpha()/decomposeColor on
            // palette.divider (e.g. inside <Divider>), which throws on var(...).
            divider:
                mode === "dark" ? "rgba(238,241,236,0.13)" : "#d7dbd6",
        },
        typography: {
            fontFamily: "Arial, Helvetica, sans-serif",
            button: { textTransform: "none", fontWeight: 700 },
        },
        shape: { borderRadius: 12 },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                        background: "var(--app-surface)",
                        border: "1px solid var(--app-border)",
                        borderRadius: "1.1rem",
                    },
                },
            },
            MuiButton: {
                styleOverrides: { root: { borderRadius: 999 } },
            },
        },
    });
}

/** Default (dark) theme — kept for any caller that doesn't switch modes. */
export const dashboardTheme = makeDashboardTheme("dark");

const SYMBOLS: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
};

export function formatMoney(minor: number, currency: string): string {
    const symbol = SYMBOLS[currency] ?? `${currency} `;
    return `${symbol}${(minor / 100).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

export function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso.replace(" ", "T") + (iso.includes("T") ? "" : "Z"));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function GlassCard({
    children,
    sx,
}: {
    children: React.ReactNode;
    sx?: any;
}) {
    return (
        <Box
            sx={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "var(--radius-panel)",
                p: { xs: 2.5, md: 3 },
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

const STATUS_COLORS: Record<string, { c: string; bg: string; b: string }> = {
    captured: { c: "var(--app-success)", bg: "color-mix(in srgb, var(--app-success) 9%, transparent)", b: "color-mix(in srgb, var(--app-success) 28%, transparent)" },
    active: { c: "var(--app-success)", bg: "color-mix(in srgb, var(--app-success) 9%, transparent)", b: "color-mix(in srgb, var(--app-success) 28%, transparent)" },
    created: { c: "var(--app-warn)", bg: "color-mix(in srgb, var(--app-warn) 9%, transparent)", b: "color-mix(in srgb, var(--app-warn) 28%, transparent)" },
    open: { c: "var(--app-warn)", bg: "color-mix(in srgb, var(--app-warn) 9%, transparent)", b: "color-mix(in srgb, var(--app-warn) 28%, transparent)" },
    failed: { c: "var(--app-danger)", bg: "color-mix(in srgb, var(--app-danger) 9%, transparent)", b: "color-mix(in srgb, var(--app-danger) 28%, transparent)" },
    expired: { c: "var(--app-fg-faint)", bg: "color-mix(in srgb, var(--app-fg-faint) 9%, transparent)", b: "color-mix(in srgb, var(--app-fg-faint) 28%, transparent)" },
    none: { c: "var(--app-fg-faint)", bg: "color-mix(in srgb, var(--app-fg-faint) 9%, transparent)", b: "color-mix(in srgb, var(--app-fg-faint) 28%, transparent)" },
};

export function StatusChip({ status }: { status: string }) {
    const s = STATUS_COLORS[status] ?? STATUS_COLORS.none;
    return (
        <Box
            component="span"
            sx={{
                display: "inline-block",
                px: 1.1,
                py: 0.3,
                borderRadius: "999px",
                fontSize: "0.7rem",
                fontWeight: 700,
                color: s.c,
                background: s.bg,
                border: `1px solid ${s.b}`,
                textTransform: "capitalize",
            }}
        >
            {status}
        </Box>
    );
}

export function StatCard({
    label,
    value,
    sub,
    accent = "var(--app-accent)",
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <GlassCard>
            <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.2 }}
            >
                <Box
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: accent,
                    }}
                />
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.65rem",
                        fontFamily: "var(--font-geist-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontWeight: 600,
                    }}
                >
                    {label}
                </Typography>
            </Box>
            <Typography
                sx={{
                    fontWeight: 510,
                    fontSize: "2.4rem",
                    letterSpacing: "-0.055em",
                    color: "var(--app-fg)",
                    lineHeight: 1,
                }}
            >
                {value}
            </Typography>
            {sub && (
                <Typography
                    sx={{
                        color: "var(--app-fg-faint)",
                        fontSize: "0.82rem",
                        mt: 0.6,
                    }}
                >
                    {sub}
                </Typography>
            )}
        </GlassCard>
    );
}
