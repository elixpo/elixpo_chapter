import { Box, Button, Stack, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";
import ResearchGeometry from "./components/research-geometry";

const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

const PRIMARY = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: "var(--bg)",
    px: 3,
    py: 1.1,
    borderRadius: "32px", // Pill
    background: "var(--fg)",
    boxShadow: "none",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--fg-muted)" },
};

const GHOST = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: INK,
    px: 2.8,
    py: 1.1,
    borderRadius: "32px", // Pill outline
    border: `1px solid ${HAIRLINE}`,
    fontFamily: "var(--font-sans)",
    "&:hover": { borderColor: INK, background: "var(--overlay)" },
};

export default function NotFound() {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                px: 3,
                background: "var(--bg)",
                color: INK,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <ResearchGeometry />
            <Stack
                alignItems="center"
                textAlign="center"
                spacing={3.5}
                sx={{ maxWidth: 520, position: "relative", zIndex: 1 }}
            >
                <Image
                    src="/logo.png"
                    alt="Elixpo Mails"
                    width={52}
                    height={52}
                    style={{ borderRadius: 12 }}
                />
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 510,
                            fontSize: { xs: "6rem", md: "8rem" },
                            lineHeight: 0.9,
                            letterSpacing: "-0.073em",
                            color: "var(--fg)",
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        404
                    </Typography>
                    <Typography
                        sx={{
                            fontWeight: 600,
                            fontSize: "1.9rem",
                            mt: 1.5,
                            letterSpacing: "-0.05em",
                            color: "var(--fg)",
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Lost in the{" "}
                        <em style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}>outbox</em>
                    </Typography>
                    <Typography
                        sx={{
                            color: SLATE,
                            fontSize: "0.98rem",
                            mt: 1.5,
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        This page didn&rsquo;t make it to the inbox. The link may be broken or the
                        page may have moved.
                    </Typography>
                </Box>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ width: "100%", justifyContent: "center" }}
                >
                    <Button component={Link} href="/" sx={PRIMARY}>
                        Back home
                    </Button>
                    <Button component={Link} href="/docs" sx={GHOST}>
                        Read the docs
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
}
