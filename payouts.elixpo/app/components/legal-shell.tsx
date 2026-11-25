"use client";

import { Box, Container, Typography } from "@mui/material";
import type React from "react";
import BackgroundAurora from "./background-aurora";
import Footer from "./footer";
import Navbar from "./navbar";

/**
 * Shared shell for prose pages (privacy, terms, refunds, email policy).
 * `summary` renders an "In plain words" box above the body.
 */
export default function LegalShell({
    title,
    updated,
    summary,
    children,
}: {
    title: string;
    updated: string;
    /** Short plain-language bullets shown in a box at the top. */
    summary?: React.ReactNode[];
    children: React.ReactNode;
}) {
    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                color: "var(--app-fg)", // Ink Black
                fontFamily: "var(--font-sofia-sans), sans-serif",
            }}
        >
            <BackgroundAurora variant="docs" />
            <Box sx={{ position: "relative", zIndex: 1 }}>
                <Navbar />
                {/* Clear the floating navbar */}
                <Container maxWidth="md" sx={{ pt: { xs: 12, md: 18 }, pb: 8 }}>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "2.4rem", md: "3.6rem" }, lineHeight: 0.98,
                            letterSpacing: "-0.055em",
                            color: "var(--app-fg)",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        {title}
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)", // Slate Gray
                            mt: 1,
                            mb: 5,
                            fontSize: "0.9rem",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Last updated: {updated}
                    </Typography>
                    {summary?.length ? (
                        <Box
                            component="aside"
                            aria-label="In plain words"
                            sx={{
                                mb: 5,
                                p: { xs: 2.5, md: 3 },
                                borderRadius: "18px",
                                border: "1px solid var(--app-border)",
                                background: "var(--app-bg-2)",
                                "& ul": { m: 0, pl: 2.5 },
                                "& li": {
                                    mb: 0.8,
                                    lineHeight: 1.6,
                                    color: "var(--app-fg)",
                                    "&:last-child": { mb: 0 },
                                },
                            }}
                        >
                            <Typography
                                component="h2"
                                sx={{
                                    fontWeight: 600,
                                    fontSize: "1.05rem",
                                    mb: 1.2,
                                    color: "var(--app-fg)",
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                In plain words
                            </Typography>
                            <ul>
                                {summary.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                        </Box>
                    ) : null}
                    <Box
                        sx={{
                            fontFamily: "var(--font-sofia-sans)",
                            "& h2": {
                                fontWeight: 500,
                                fontSize: "1.4rem",
                                mt: 5,
                                mb: 2,
                                color: "var(--app-fg)",
                                letterSpacing: "-0.035em",
                            },
                            "& h3": {
                                fontWeight: 600,
                                fontSize: "1.05rem",
                                mt: 3,
                                mb: 1.2,
                                color: "var(--app-fg)",
                            },
                            "& p": {
                                color: "var(--app-fg)", // Charcoal
                                lineHeight: 1.7,
                                mb: 2,
                                fontSize: "1rem",
                                fontWeight: 450,
                            },
                            "& ul": {
                                color: "var(--app-fg)",
                                lineHeight: 1.7,
                                pl: 3,
                                mb: 2,
                            },
                            "& li": { mb: 0.8 },
                            "& a": {
                                color: "var(--app-accent)", // Link Blue
                                textDecoration: "none",
                                "&:hover": { textDecoration: "underline" },
                            },
                            "& code": {
                                fontFamily: "var(--font-geist-mono)",
                                fontSize: "0.85rem",
                                background: "var(--app-overlay)",
                                color: "var(--app-accent)", // Signal Orange
                                px: 0.8,
                                py: 0.2,
                                borderRadius: "4px",
                            },
                        }}
                    >
                        {children}
                    </Box>
                </Container>
                <Footer />
            </Box>
        </Box>
    );
}
