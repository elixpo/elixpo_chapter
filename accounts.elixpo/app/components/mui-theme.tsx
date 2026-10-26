"use client";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";
import { useTheme as useAppTheme } from "./theme-provider";

// MUI runs alpha()/decomposeColor() on palette colors at style-compute time
// (e.g. a Button's hover background = alpha(palette.text.primary, …)). Those
// helpers can parse hex/rgb/rgba but NOT `var(--token)`, so the palette must
// hold literal colors. We mirror the globals.css tokens for each mode here and
// switch on the app theme; the sx-level `var()` usages elsewhere are fine since
// they're raw CSS and never pass through alpha().
const PALETTE = {
    light: {
        paper: "#ffffff",
        primary: "#3a65c7",
        text: "#142018",
        textMuted: "rgba(20, 32, 24, 0.72)",
        textFaint: "rgba(20, 32, 24, 0.54)",
        divider: "#d7dbd6",
    },
    dark: {
        paper: "#16201a",
        primary: "#79a7ff",
        text: "#eef1ec",
        textMuted: "rgba(238, 241, 236, 0.72)",
        textFaint: "rgba(238, 241, 236, 0.52)",
        divider: "rgba(238, 241, 236, 0.12)",
    },
} as const;

export const makeMuiTheme = (mode: "light" | "dark") => {
    const c = PALETTE[mode];
    return createTheme({
        palette: {
            mode,
            primary: { main: c.primary },
            background: {
                default: "transparent",
                paper: c.paper,
            },
            text: {
                primary: c.text,
                secondary: c.textMuted,
                disabled: c.textFaint,
            },
            divider: c.divider,
        },
        typography: {
            fontFamily: "Arial, Helvetica, sans-serif",
            h1: { letterSpacing: "-0.05em" },
            h2: { letterSpacing: "-0.05em" },
            h3: { letterSpacing: "-0.045em" },
            h4: { letterSpacing: "-0.04em", fontWeight: 700 },
            h5: { letterSpacing: "-0.03em", fontWeight: 700 },
            h6: { letterSpacing: "-0.02em", fontWeight: 700 },
            button: { textTransform: "none", fontWeight: 700 },
        },
        shape: { borderRadius: 12 },
        components: {
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: {
                    root: { borderRadius: 999, paddingInline: 18 },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "22px",
                        boxShadow: "none",
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "18px",
                    },
                },
            },
            MuiChip: {
                styleOverrides: { root: { borderRadius: 999 } },
            },
        },
    });
};

/** Applies the research-styled MUI theme for the current light/dark mode. */
export function MuiThemeBridge({ children }: { children: React.ReactNode }) {
    const { theme } = useAppTheme();
    const muiTheme = useMemo(() => makeMuiTheme(theme), [theme]);
    return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>;
}
