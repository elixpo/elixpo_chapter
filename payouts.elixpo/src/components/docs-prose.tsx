"use client";

import { Box, Chip, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";

export function DocTitle({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h1"
            sx={{
                fontWeight: 500,
                fontSize: "2.4rem",
                letterSpacing: "-0.055em",
                mb: 2,
                color: "var(--app-fg)", // Ink Black
                fontFamily: "var(--font-sofia-sans)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocLead({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                color: "var(--app-fg)", // Charcoal
                fontSize: "1.05rem",
                lineHeight: 1.7,
                mb: 3.5,
                fontFamily: "var(--font-sofia-sans)",
                fontWeight: 450,
            }}
        >
            {children}
        </Typography>
    );
}

export function DocH2({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h2"
            sx={{
                fontWeight: 500,
                fontSize: "1.5rem",
                mt: 5,
                mb: 2,
                color: "var(--app-fg)", // Ink Black
                letterSpacing: "-0.035em",
                fontFamily: "var(--font-sofia-sans)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocP({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                color: "var(--app-fg)", // Charcoal
                lineHeight: 1.7,
                mb: 2,
                fontSize: "1rem",
                fontFamily: "var(--font-sofia-sans)",
                fontWeight: 450,
            }}
        >
            {children}
        </Typography>
    );
}

export function DocList({ items }: { items: React.ReactNode[] }) {
    return (
        <Box
            component="ul"
            sx={{
                color: "var(--app-fg)",
                pl: 3,
                mb: 2.5,
                fontFamily: "var(--font-sofia-sans)",
                "& li": { mb: 0.8, lineHeight: 1.65, fontWeight: 450 },
            }}
        >
            {items.map((it, i) => (
                <li key={i}>{it}</li>
            ))}
        </Box>
    );
}

export function Code({ children }: { children: React.ReactNode }) {
    return (
        <Box
            component="code"
            sx={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.85rem",
                background: "var(--app-overlay)",
                color: "var(--app-accent)", // Signal Orange
                px: 0.6,
                py: 0.2,
                borderRadius: "4px",
            }}
        >
            {children}
        </Box>
    );
}

export function BaseUrlChip() {
    return (
        <Chip
            label="Base URL: https://payouts.elixpo.com"
            sx={{
                bgcolor: "var(--app-overlay)",
                color: "var(--app-fg)",
                border: "1.5px solid var(--app-overlay)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.82rem",
                mb: 4,
            }}
        />
    );
}

export interface DocAction {
    label: string;
    href: string;
    /** One short line under the label, e.g. what you get there. */
    hint?: string;
    primary?: boolean;
}

/**
 * Setup buttons inside the docs: each one opens the exact dashboard screen the
 * surrounding text talks about (create a key, set the webhook, connect a bank).
 */
export function DocActions({ actions }: { actions: DocAction[] }) {
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(actions.length, 3)}, minmax(0, 1fr))` },
                gap: 1.2,
                my: 2.5,
            }}
        >
            {actions.map((a) => (
                <Box
                    key={a.href + a.label}
                    component={Link}
                    href={a.href}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.4,
                        p: "0.9rem 1.1rem",
                        borderRadius: "14px",
                        textDecoration: "none",
                        border: "1px solid",
                        borderColor: a.primary ? "var(--app-ink)" : "var(--app-border)",
                        background: a.primary ? "var(--app-ink)" : "var(--app-surface)",
                        color: a.primary ? "var(--app-on-ink)" : "var(--app-fg)",
                        transition: "transform 0.15s ease, border-color 0.15s ease",
                        "&:hover": { transform: "translateY(-2px)", borderColor: a.primary ? "var(--app-ink)" : "var(--app-fg)" },
                        "&:focus-visible": { outline: "3px solid var(--app-accent)", outlineOffset: "2px" },
                    }}
                >
                    <Box component="span" sx={{ fontWeight: 700, fontSize: "0.92rem" }}>
                        {a.label} →
                    </Box>
                    {a.hint ? (
                        <Box
                            component="span"
                            sx={{ fontSize: "0.8rem", lineHeight: 1.45, color: a.primary ? "var(--app-on-ink-muted)" : "var(--app-fg-muted)" }}
                        >
                            {a.hint}
                        </Box>
                    ) : null}
                </Box>
            ))}
        </Box>
    );
}
