"use client";

import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { Box, Button, Snackbar, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

const EMAIL = "hello@elixpo.com";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
    {
        heading: "Product",
        links: [
            { label: "Pricing", href: "/pricing" },
            { label: "Sign in", href: "/login" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "Docs", href: "/docs" },
        ],
    },
    {
        heading: "Company",
        links: [
            { label: "Elixpo", href: "https://elixpo.com" },
            { label: "GitHub", href: "https://github.com/elixpo/mails.elixpo" },
            { label: "Contact", href: "mailto:hello@elixpo.com" },
        ],
    },
    {
        heading: "Legal",
        links: [
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
            { label: "Content Policy", href: "/content-policy" },
        ],
    },
];

const Footer = () => {
    const [copied, setCopied] = useState(false);

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(EMAIL);
            setCopied(true);
        } catch {
            window.location.href = `mailto:${EMAIL}`;
        }
    };

    return (
        <Box
            component="footer"
            sx={{
                position: "relative",
                zIndex: 1,
                mt: { xs: 8, md: 12 },
                borderTop: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--fg)",
                pt: { xs: 6, md: 7 },
                pb: { xs: 4, md: 5 },
            }}
        >
            <Box sx={{ maxWidth: 1450, mx: "auto", px: { xs: 2, md: 4 } }}>
                <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={{ xs: 5, lg: 8 }}
                    justifyContent="space-between"
                    sx={{ mb: { xs: 5, md: 6 } }}
                >
                    <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                        sx={{ maxWidth: 460 }}
                    >
                        <Box
                            component="img"
                            src="/mark.png"
                            alt=""
                            width={42}
                            height={42}
                            sx={{ borderRadius: "10px", flexShrink: 0 }}
                        />
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>
                                Elixpo Mails
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--fg-muted)",
                                    mt: 0.6,
                                    lineHeight: 1.6,
                                    fontSize: "0.92rem",
                                }}
                            >
                                Event-based transactional email, sent from your own mailbox. Part of
                                the open Elixpo ecosystem.
                            </Typography>
                            <Tooltip title={copied ? "Copied!" : "Click to copy"} arrow>
                                <Button
                                    onClick={copyEmail}
                                    startIcon={
                                        <MailOutlineIcon sx={{ fontSize: "1rem !important" }} />
                                    }
                                    sx={{
                                        mt: 2,
                                        textTransform: "none",
                                        color: "var(--fg)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.78rem",
                                        fontWeight: 700,
                                        border: "1px solid var(--border)",
                                        borderRadius: "999px",
                                        px: 1.6,
                                        py: 0.7,
                                        "&:hover": {
                                            borderColor: "var(--fg)",
                                            background: "var(--overlay)",
                                        },
                                    }}
                                >
                                    {EMAIL}
                                </Button>
                            </Tooltip>
                        </Box>
                    </Stack>

                    <Stack
                        direction="row"
                        spacing={{ xs: 3, sm: 6, md: 8 }}
                        component="nav"
                        aria-label="Footer"
                    >
                        {COLUMNS.map((col) => (
                            <Box key={col.heading} sx={{ minWidth: 0 }}>
                                <Typography className="eyebrow" component="p">
                                    {col.heading}
                                </Typography>
                                <Stack spacing={1.2}>
                                    {col.links.map((l) => (
                                        <Box
                                            key={l.label}
                                            component={Link}
                                            href={l.href}
                                            sx={{
                                                color: "var(--fg)",
                                                textDecoration: "none",
                                                fontSize: "0.82rem",
                                                fontWeight: 650,
                                                transition: "opacity 0.2s ease",
                                                "&:hover": { opacity: 0.55 },
                                            }}
                                        >
                                            {l.label}
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Stack>

                <Box
                    sx={{
                        pt: 3,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: { xs: "column", sm: "row" },
                        justifyContent: "space-between",
                        alignItems: { xs: "flex-start", sm: "center" },
                        gap: 1.5,
                        color: "var(--fg-muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.68rem",
                        letterSpacing: "0.06em",
                    }}
                >
                    <Typography sx={{ fontSize: "inherit", fontFamily: "inherit" }}>
                        © {new Date().getFullYear()} Elixpo · Event-based transactional email
                    </Typography>
                    <Typography sx={{ fontSize: "inherit", fontFamily: "inherit" }}>
                        mails.elixpo.com
                    </Typography>
                </Box>
            </Box>

            <Snackbar
                open={copied}
                autoHideDuration={2000}
                onClose={() => setCopied(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={`Copied ${EMAIL}`}
            />
        </Box>
    );
};

export default Footer;
