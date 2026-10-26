"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";

// Senders brand list for the trust logos
const SENDER_BRANDS = ["Gmail", "Outlook", "Yahoo", "iCloud", "Zoho", "Proton", "Fastmail", "SMTP"];

export default function PixelHero({ authed }: { authed?: boolean | null }) {
    const signedIn = authed === true;
    const primaryHref = signedIn ? "/dashboard" : "/api/auth/login";
    const primaryLabel = signedIn ? "Go to your dashboard" : "Get started with Elixpo";
    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                background: "var(--background)",
                color: "var(--fg)",
                minHeight: { md: "calc(100svh - 94px)" },
                pt: { xs: 10, md: 15 },
                pb: { xs: 6, md: 8 },
                overflow: "hidden",
            }}
        >
            <style>{`
                @keyframes pulseSlow {
                    0%, 100% { opacity: 0.15; transform: scale(1); }
                    50% { opacity: 0.25; transform: scale(1.05); }
                }
            `}</style>

            <Box aria-hidden sx={{ display: { xs: "none", lg: "block" } }}>
                <Box
                    sx={{
                        position: "absolute",
                        width: 430,
                        height: 430,
                        border: "1px solid color-mix(in srgb, var(--fg) 25%, transparent)",
                        borderRadius: "50%",
                        right: -120,
                        top: 80,
                        "&::after": {
                            content: '""',
                            position: "absolute",
                            width: 14,
                            height: 14,
                            left: 42,
                            top: 55,
                            borderRadius: "50%",
                            background: "var(--geo-blue)",
                        },
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        width: 260,
                        height: 260,
                        left: -110,
                        bottom: -110,
                        border: "1px solid color-mix(in srgb, var(--fg) 25%, transparent)",
                        borderRadius: "50%",
                        "&::after": {
                            content: '""',
                            position: "absolute",
                            width: 14,
                            height: 14,
                            right: 27,
                            top: 28,
                            borderRadius: "50%",
                            background: "var(--orange)",
                        },
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        width: 132,
                        height: 132,
                        right: "6%",
                        bottom: "24%",
                        borderRadius: "50%",
                        bgcolor: "var(--geo-blue)",
                        color: "#fff",
                        transform: "rotate(8deg)",
                        boxShadow: "0 28px 80px rgba(24,38,28,.16)",
                        display: "grid",
                        placeContent: "center",
                        textAlign: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: ".62rem",
                        fontWeight: 600,
                        letterSpacing: ".14em",
                    }}
                >
                    SMTP
                    <Box component="b" sx={{ mt: 0.6, fontSize: ".78rem" }}>
                        BYO
                    </Box>
                </Box>
                <Box
                    sx={{
                        position: "absolute",
                        width: 155,
                        height: 155,
                        borderRadius: "45% 55% 66% 34%",
                        bgcolor: "#f0b526",
                        right: "12%",
                        top: "23%",
                        transform: "rotate(13deg)",
                        boxShadow: "0 28px 75px rgba(20,32,24,.14)",
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        width: 190,
                        height: 112,
                        border: "1px solid var(--border)",
                        borderRadius: "18px",
                        bgcolor: "var(--surface)",
                        right: "25%",
                        bottom: "18%",
                        transform: "rotate(7deg)",
                        backdropFilter: "blur(12px)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: ".72rem",
                        letterSpacing: ".14em",
                    }}
                >
                    EVENT → EMAIL
                </Box>
            </Box>

            {/* Editorial hero header */}
            <Box
                sx={{
                    maxWidth: 1450,
                    mx: "auto",
                    px: { xs: 2.5, md: 4 },
                    textAlign: "left",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* Taxonomy Chip */}
                <Typography
                    sx={{
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        fontSize: ".68rem",
                        fontWeight: 700,
                        letterSpacing: "0.19em",
                        textTransform: "uppercase",
                        mb: 2.5,
                        display: "inline-block",
                    }}
                >
                    Elixpo Mails / Delivery platform
                </Typography>

                {/* Monumental Display Headline */}
                <Typography
                    component="h1"
                    sx={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 510,
                        fontSize: { xs: "3.35rem", sm: "5rem", md: "clamp(4rem,7.8vw,8rem)" },
                        lineHeight: 0.9,
                        letterSpacing: "-0.073em",
                        color: "var(--fg)",
                        mb: 3,
                        maxWidth: 1120,
                        "& span": {
                            fontFamily: "Georgia, serif",
                            fontStyle: "italic",
                            fontWeight: 400,
                        },
                    }}
                >
                    Transactional email,
                    <br />
                    under <span>your control.</span>
                </Typography>

                {/* Body paragraph */}
                <Typography
                    sx={{
                        fontFamily: "var(--font-sans)",
                        color: "var(--fg-muted)",
                        fontSize: { xs: "1.05rem", md: "1.18rem" },
                        lineHeight: 1.6,
                        maxWidth: 720,
                        mb: 4.5,
                    }}
                >
                    Elixpo Mails is the control plane between your product events and your own SMTP
                    provider. Your team designs, approves, triggers, and audits expected email; your
                    provider remains the sender of record.
                </Typography>

                {/* Actions: Pill CTA & Underlined Action Link */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={3}
                    justifyContent="flex-start"
                    alignItems={{ xs: "stretch", sm: "center" }}
                    sx={{ mb: 8 }}
                >
                    <Button
                        component="a"
                        href={primaryHref}
                        sx={{
                            background: "var(--fg)",
                            color: "var(--bg)",
                            borderRadius: "999px",
                            px: 3.5,
                            py: 1.4,
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            textTransform: "none",
                            boxShadow: "none",
                            "&:hover": {
                                background: "var(--fg)",
                                opacity: 0.82,
                            },
                        }}
                    >
                        {primaryLabel}
                    </Button>
                    <Button
                        component={Link}
                        href="/docs"
                        sx={{
                            color: "var(--fg)",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            textTransform: "none",
                            borderRadius: "32px",
                            px: 3.5,
                            py: 1.4,
                            background: "var(--surface-2)",
                            backdropFilter: "blur(12px)",
                            border: "1px solid var(--border)",
                            fontFamily: "var(--font-sans)",
                            transition: "all 0.22s ease-in-out",
                            "&:hover": {
                                background: "var(--overlay)",
                                borderColor: "var(--fg)",
                            },
                        }}
                    >
                        Explore the documentation →
                    </Button>
                </Stack>
            </Box>

            {/* Centered monochrome quiet Trust Logo Strip */}
            <Box
                sx={{
                    borderTop: "1px solid var(--border)",
                    pt: 5,
                    mt: { xs: 4, md: 6 },
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <Container maxWidth="lg">
                    <Typography
                        sx={{
                            textAlign: { xs: "left", md: "center" },
                            fontSize: "12px",
                            fontWeight: 500,
                            letterSpacing: "0.08em",
                            color: "var(--fg-faint)",
                            textTransform: "uppercase",
                            mb: 4,
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        Compatible with any mailbox provider
                    </Typography>

                    <Stack
                        direction="row"
                        spacing={{ xs: 4, sm: 6, md: 8 }}
                        justifyContent={{ xs: "flex-start", md: "center" }}
                        alignItems="center"
                        sx={{
                            flexWrap: "wrap",
                            rowGap: 3,
                            "& span": {
                                fontSize: "1.1rem",
                                fontWeight: 700,
                                color: "var(--fg-faint)",
                                letterSpacing: "-0.01em",
                                transition: "color 0.2s ease",
                                cursor: "default",
                                "&:hover": {
                                    color: "var(--fg)",
                                },
                            },
                        }}
                    >
                        {SENDER_BRANDS.map((brand) => (
                            <Typography key={brand} component="span">
                                {brand}
                            </Typography>
                        ))}
                    </Stack>
                </Container>
            </Box>
        </Box>
    );
}
