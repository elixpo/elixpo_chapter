"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ShieldIcon from "@mui/icons-material/VerifiedUser";
import { Box, Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import BackgroundAurora from "../components/background-aurora";

const ACCOUNTS_URL = "https://accounts.elixpo.com/docs";

const BENEFITS = [
    "One account across every Elixpo product — sign in once, use them all.",
    "Secure OAuth 2.0 — your password stays with Elixpo, we never see it.",
];

// Friendly copy for the ?error= values /api/auth/* can redirect with.
const ERROR_MESSAGES: Record<string, string> = {
    access_denied: "You cancelled the sign-in on Elixpo Accounts.",
    missing_code:
        "Sign-in didn't complete — Elixpo Accounts returned no authorization code.",
    bad_state:
        "Your sign-in link expired or was opened in another browser. Please start again.",
    sso_failed:
        "We couldn't reach Elixpo Accounts to finish signing you in. Please try again in a moment.",
    sso_unconfigured:
        "Sign-in is temporarily unavailable (Elixpo Accounts client not configured).",
};

export default function LoginError({
    error,
    next,
}: {
    error: string;
    next: string;
}) {
    const message =
        ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.";
    const retryHref = `/api/auth/login?next=${encodeURIComponent(next)}`;

    return (
        <Box
            component="main"
            id="main-content"
            tabIndex={-1}
            sx={{
                position: "relative",
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                p: 2,
                color: "var(--app-fg)", // Ink Black text
                bgcolor: "var(--app-bg)",
            }}
        >
            <BackgroundAurora variant="auth" />
            
            {/* Login Card Container */}
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    maxWidth: 460,
                    p: { xs: 3.5, md: 4 },
                    borderRadius: "var(--radius-card)",
                    textAlign: "center",
                    background: "var(--app-bg-2)", // Lifted Cream background
                    border: "1.5px solid var(--app-overlay)",
                    boxShadow: "rgba(20, 32, 24, 0.05) 0px 16px 48px 0px", // Soft premium shadow
                }}
            >
                {/* Logo Image */}
                <Box
                    component="img"
                    src="/logo.png"
                    alt="Elixpo Pay"
                    sx={{
                        height: 36,
                        width: "auto",
                        mx: "auto",
                        mb: 3,
                        display: "block",
                    }}
                />

                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: "1.8rem",
                        letterSpacing: "-0.055em",
                        color: "var(--app-fg)", // Ink Black
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    Sign in to Elixpo Pay
                </Typography>
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)", // Slate Gray
                        fontSize: "0.95rem",
                        mt: 0.8,
                        fontFamily: "var(--font-sofia-sans)",
                        fontWeight: 450,
                    }}
                >
                    Manage your products, pricing, and payouts.
                </Typography>

                <Box
                        role="alert"
                        sx={{
                            mt: 2.5,
                            px: 2,
                            py: 1.2,
                            borderRadius: "12px",
                            background: "color-mix(in srgb, var(--app-danger) 5%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--app-danger) 20%, transparent)",
                            color: "var(--app-danger)",
                            fontSize: "0.85rem",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        {message}
                    </Box>

                {/* Primary Button - Ink Pill style */}
                <Button
                    component="a"
                    href={retryHref}
                    fullWidth
                    sx={{
                        mt: 3.5,
                        textTransform: "none",
                        fontWeight: 650,
                        fontSize: "15px",
                        color: "var(--app-on-ink)", // Light text on ink
                        py: 1.4,
                        borderRadius: "999px", // Button radius 20px
                        background: "var(--app-ink)", // Ink Black
                        border: "1.5px solid var(--app-ink)",
                        fontFamily: "var(--font-sofia-sans)",
                        letterSpacing: "-0.2px",
                        "&:hover": {
                            background: "var(--app-ink)",
                            borderColor: "var(--app-ink)",
                        },
                        "&:active": {
                            transform: "scale(0.98)",
                        },
                    }}
                >
                    Try again with Elixpo Accounts
                </Button>

                {/* Explainer Segment */}
                <Box
                    sx={{
                        mt: 4,
                        p: 2.5,
                        borderRadius: "var(--radius-panel)",
                        textAlign: "left",
                        background: "var(--app-overlay)", // Soft Bone tint
                        border: "1px solid var(--app-overlay)",
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ mb: 1.5 }}
                    >
                        <ShieldIcon sx={{ fontSize: 18, color: "var(--app-accent)" }} /> {/* Signal Orange icon */}
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--app-fg)", fontFamily: "var(--font-sofia-sans)" }}
                        >
                            New here? What is Elixpo Accounts?
                        </Typography>
                    </Stack>
                    
                    <Typography
                        sx={{
                            color: "var(--app-fg)", // Charcoal
                            fontSize: "0.85rem",
                            lineHeight: 1.6,
                            mb: 2,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        Elixpo Pay doesn't have its own password. It uses{" "}
                        <strong style={{ color: "var(--app-fg)" }}>
                            Elixpo Accounts
                        </strong>{" "}
                        — the single, secure sign-on shared across the whole
                        Elixpo ecosystem. One identity, everywhere.
                    </Typography>

                    <Stack spacing={1.2}>
                        {BENEFITS.map((b) => (
                            <Stack
                                key={b}
                                direction="row"
                                spacing={1}
                                alignItems="flex-start"
                            >
                                <CheckCircleIcon
                                    sx={{
                                        fontSize: 16,
                                        color: "var(--app-accent)", // Signal Orange checks
                                        mt: "2px",
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography
                                    sx={{
                                        color: "var(--app-fg)",
                                        fontSize: "0.84rem",
                                        lineHeight: 1.5,
                                        fontFamily: "var(--font-sofia-sans)",
                                        fontWeight: 450,
                                    }}
                                >
                                    {b}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>

                    <Box
                        component="a"
                        href={ACCOUNTS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            mt: 2,
                            color: "var(--app-accent)", // Signal Orange links
                            fontSize: "0.84rem",
                            fontWeight: 600,
                            textDecoration: "none",
                            fontFamily: "var(--font-sofia-sans)",
                            "&:hover": { color: "var(--app-accent-2)" },
                        }}
                    >
                        Learn more about Elixpo Accounts
                    </Box>
                </Box>

                {/* Secondary navigation buttons: Outlined Pills */}
                <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
                    <Button
                        component={Link}
                        href="/"
                        startIcon={
                            <ArrowBackIcon sx={{ fontSize: "1rem !important" }} />
                        }
                        sx={outlinedPillBtn}
                    >
                        Back home
                    </Button>
                    <Button
                        component={Link}
                        href="/docs"
                        startIcon={
                            <MenuBookIcon sx={{ fontSize: "1.05rem !important" }} />
                        }
                        sx={outlinedPillBtn}
                    >
                        Read the docs
                    </Button>
                </Stack>

                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.78rem",
                        mt: 3,
                        fontFamily: "var(--font-sofia-sans)",
                        fontWeight: 450,
                    }}
                >
                    🔒 Secured by Elixpo Accounts · OAuth 2.0
                </Typography>
            </Box>
        </Box>
    );
}

const outlinedPillBtn = {
    flex: 1,
    textTransform: "none",
    fontWeight: 500,
    fontSize: "14px",
    color: "var(--app-fg)", // Ink Black
    py: 1,
    borderRadius: "999px", // Outlined Pill radius 20px
    background: "var(--app-surface)",
    border: "1.5px solid var(--app-border)",
    fontFamily: "var(--font-sofia-sans)",
    "&:hover": {
        borderColor: "var(--app-fg)",
        background: "var(--app-overlay)",
    },
};
