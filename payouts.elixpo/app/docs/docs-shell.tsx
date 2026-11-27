"use client";

import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    Check as CheckIcon,
    ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
    Box,
    Button,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Snackbar,
    Tooltip,
    Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { makeDashboardTheme } from "@/components/dashboard-ui";
import { useThemeMode } from "@/components/theme-mode";
import BackgroundAurora from "../components/background-aurora";
import Footer from "../components/footer";
import Navbar from "../components/navbar";

const DOCS_NAV = [
    { label: "Overview", href: "/docs", group: "Get started" },
    { label: "Quickstart", href: "/docs/quickstart", group: "Get started" },
    { label: "Catalog sync", href: "/docs/catalog", group: "Build" },
    { label: "Checkout sessions", href: "/docs/checkout", group: "Build" },
    { label: "Webhooks", href: "/docs/webhooks", group: "Build" },
    { label: "Entitlements API", href: "/docs/entitlements", group: "Build" },
    { label: "Buyer emails", href: "/docs/emails", group: "Build" },
    { label: "Fundraisers", href: "/docs/fundraisers", group: "Get paid" },
    { label: "Connected payouts", href: "/docs/payouts", group: "Get paid" },
];
const GROUPS = ["Get started", "Build", "Get paid"] as const;

/** The three things every integrator has to do in the dashboard. */
const SETUP = [
    { label: "Create an app & secret key", href: "/dashboard/products" },
    { label: "Connect your bank", href: "/dashboard/payouts" },
    { label: "Start a fundraiser", href: "/dashboard/fundraisers" },
];

export default function DocsShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { mode } = useThemeMode();
    const theme = makeDashboardTheme(mode);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const buildLlmPayload = (): string => {
        const root = document.getElementById("docs-content");
        if (!root) return "";

        const lines: string[] = [];
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").trim();
            if (!text && tag !== "pre" && tag !== "code") {
                el.childNodes.forEach(walk);
                return;
            }
            switch (tag) {
                case "h1":
                    lines.push(`# ${text}`, "");
                    return;
                case "h2":
                    lines.push("", `## ${text}`, "");
                    return;
                case "h3":
                    lines.push("", `### ${text}`, "");
                    return;
                case "h4":
                    lines.push("", `#### ${text}`, "");
                    return;
                case "li":
                    lines.push(`- ${text}`);
                    return;
                case "pre": {
                    const code = el.textContent || "";
                    lines.push("", "```", code.trim(), "```", "");
                    return;
                }
                case "code":
                    if (
                        el.parentElement &&
                        el.parentElement.tagName.toLowerCase() !== "pre"
                    ) {
                        return;
                    }
                    return;
                case "p":
                    lines.push(text, "");
                    return;
                default:
                    el.childNodes.forEach(walk);
            }
        };
        root.childNodes.forEach(walk);
        const pageTitle =
            DOCS_NAV.find((n) => n.href === pathname)?.label || "Overview";
        const url =
            typeof window !== "undefined"
                ? `${window.location.origin}${pathname}`
                : pathname;

        const header = [
            `# Elixpo Pay Docs — ${pageTitle}`,
            "",
            `Source: ${url}`,
            "",
            "This is one section of the Elixpo Pay developer documentation, with a complete API primer prepended so this excerpt is self-contained.",
            "",
            "## Elixpo Pay — API at a glance",
            "",
            "Elixpo Pay is a multi-tenant payments & payouts SaaS. Apps integrate a hosted checkout and receive entitlement grants. Uses Razorpay (INR) for payments today (Stripe for international coming soon) and Elixpo Accounts for SSO.",
            "",
            "- Base URL: `https://payouts.elixpo.com`",
            "- Auth (server→server, `/v1/*`): `Authorization: Bearer <secret key>` — the secret key.",
            "",
        ].join("\n");

        return `${header + lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
    };

    const handleCopyForLlm = async () => {
        const payload = buildLlmPayload();
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = payload;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                setCopied(true);
            } catch {}
            document.body.removeChild(ta);
        }
    };

    const idx = DOCS_NAV.findIndex((n) => n.href === pathname);
    const prev = idx > 0 ? DOCS_NAV[idx - 1] : null;
    const next =
        idx >= 0 && idx < DOCS_NAV.length - 1 ? DOCS_NAV[idx + 1] : null;

    const current = idx >= 0 ? DOCS_NAV[idx] : null;

    const renderSidebar = () => (
        <Box sx={{ p: 2 }}>
            {GROUPS.map((g) => (
                <Box key={g} sx={{ mb: 2 }}>
                    <Typography
                        sx={{
                            px: 2,
                            mb: 0.6,
                            fontSize: "0.66rem",
                            fontWeight: 700,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            fontFamily: "var(--font-geist-mono)",
                            color: "var(--app-fg-faint)",
                        }}
                    >
                        {g}
                    </Typography>
                    <List sx={{ p: 0 }}>
                        {DOCS_NAV.filter((n) => n.group === g).map((item) => {
                            const active = pathname === item.href;
                            return (
                                <ListItem key={item.href} disablePadding sx={{ mb: 0.25 }}>
                                    <ListItemButton
                                        component={Link}
                                        href={item.href}
                                        aria-current={active ? "page" : undefined}
                                        onClick={() => setMobileOpen(false)}
                                        sx={{
                                            borderRadius: "10px",
                                            py: 0.7,
                                            px: 2,
                                            borderLeft: "2px solid",
                                            borderColor: active ? "var(--app-accent)" : "transparent",
                                            bgcolor: active ? "var(--app-overlay)" : "transparent",
                                            color: active ? "var(--app-fg)" : "var(--app-fg-muted)",
                                            "&:hover": { bgcolor: "var(--app-overlay)", color: "var(--app-fg)" },
                                        }}
                                    >
                                        <ListItemText
                                            primary={item.label}
                                            primaryTypographyProps={{
                                                fontSize: "0.88rem",
                                                fontWeight: active ? 650 : 500,
                                                fontFamily: "var(--font-sofia-sans)",
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                    </List>
                </Box>
            ))}

            <Box
                sx={{
                    mt: 1,
                    p: 1.8,
                    borderRadius: "14px",
                    border: "1px solid var(--app-border)",
                    background: "var(--app-surface)",
                }}
            >
                <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", mb: 1 }}>Set up in the dashboard</Typography>
                {SETUP.map((a) => (
                    <Box
                        key={a.href}
                        component={Link}
                        href={a.href}
                        onClick={() => setMobileOpen(false)}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            py: 0.6,
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            color: "var(--app-link)",
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                        }}
                    >
                        {a.label}
                        <ChevronRightIcon sx={{ fontSize: 16 }} />
                    </Box>
                ))}
            </Box>
        </Box>
    );

    return (
        <ThemeProvider theme={theme}>
            <Snackbar
                open={copied}
                autoHideDuration={2400}
                onClose={() => setCopied(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message="Copied page as markdown to clipboard — paste into any LLM"
            />
            <Box sx={{ position: "relative", minHeight: "100vh", color: "var(--app-fg)" }}>
                <BackgroundAurora variant="docs" />
                <Box sx={{ position: "relative", zIndex: 1 }}>
                    <Navbar />

                    <Box
                        sx={{
                            display: "flex",
                            maxWidth: "1280px",
                            width: "100%",
                            mx: "auto",
                            px: { xs: 2, md: 3 },
                            pt: { xs: 2, md: 4 },
                        }}
                    >
                        {/* Desktop sidebar */}
                        <Box
                            component="nav"
                            aria-label="Documentation"
                            sx={{
                                width: 250,
                                flexShrink: 0,
                                display: { xs: "none", md: "block" },
                                borderRight: "1px solid var(--app-overlay)",
                                position: "sticky",
                                top: 110,
                                alignSelf: "flex-start",
                                maxHeight: "calc(100vh - 120px)",
                                overflowY: "auto",
                            }}
                        >
                            {renderSidebar()}
                        </Box>

                        {/* Mobile drawer */}
                        <Drawer
                            variant="temporary"
                            open={mobileOpen}
                            onClose={() => setMobileOpen(false)}
                            ModalProps={{ keepMounted: true }}
                            sx={{
                                display: { xs: "block", md: "none" },
                                "& .MuiDrawer-paper": {
                                    width: 280,
                                    bgcolor: "var(--app-bg)",
                                    borderRight: "1px solid var(--app-border)",
                                    color: "var(--app-fg)",
                                },
                            }}
                        >
                            {renderSidebar()}
                        </Drawer>

                        <Box
                            component="main"
                            id="main-content"
                            tabIndex={-1}
                            sx={{ flexGrow: 1, minWidth: 0, pb: 10, px: { xs: 0, md: 5 }, maxWidth: 860 }}
                        >
                            {/* Docs toolbar: menu (mobile), breadcrumb, copy-for-LLM */}
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    flexWrap: "wrap",
                                    pb: 2,
                                    mb: 4,
                                    borderBottom: "1px solid var(--app-overlay)",
                                }}
                            >
                                <Button
                                    onClick={() => setMobileOpen(true)}
                                    startIcon={<MenuIcon />}
                                    sx={{ ...pillBtn, display: { xs: "inline-flex", md: "none" } }}
                                >
                                    Menu
                                </Button>
                                <Box
                                    component="nav"
                                    aria-label="Breadcrumb"
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                        fontSize: "0.85rem",
                                        color: "var(--app-fg-muted)",
                                        "& a": { color: "inherit", textDecoration: "none" },
                                        "& a:hover": { color: "var(--app-fg)" },
                                    }}
                                >
                                    <Link href="/docs">Docs</Link>
                                    {current && current.href !== "/docs" ? (
                                        <>
                                            <ChevronRightIcon sx={{ fontSize: 16 }} />
                                            <span>{current.group}</span>
                                            <ChevronRightIcon sx={{ fontSize: 16 }} />
                                            <Box component="span" sx={{ color: "var(--app-fg)", fontWeight: 600 }}>
                                                {current.label}
                                            </Box>
                                        </>
                                    ) : null}
                                </Box>
                                <Box sx={{ flexGrow: 1 }} />
                                <Tooltip title="Copy this page as markdown to paste into an LLM" arrow>
                                    <Button
                                        onClick={handleCopyForLlm}
                                        startIcon={
                                            copied ? (
                                                <CheckIcon sx={{ fontSize: "1rem !important" }} />
                                            ) : (
                                                <ContentCopyIcon sx={{ fontSize: "0.95rem !important" }} />
                                            )
                                        }
                                        sx={{ ...pillBtn, color: copied ? "var(--app-accent)" : "var(--app-fg)" }}
                                    >
                                        {copied ? "Copied" : "Copy for LLM"}
                                    </Button>
                                </Tooltip>
                                <Button component={Link} href="/dashboard/products" sx={inkBtn}>
                                    Get API keys
                                </Button>
                            </Box>

                            <Box id="docs-content">{children}</Box>

                            <Divider sx={{ my: 5, borderColor: "var(--app-overlay)" }} />

                            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                                {prev ? (
                                    <Button component={Link} href={prev.href} startIcon={<ArrowBackIcon />} sx={navBtn}>
                                        {prev.label}
                                    </Button>
                                ) : (
                                    <Box />
                                )}
                                {next ? (
                                    <Button component={Link} href={next.href} endIcon={<ArrowForwardIcon />} sx={navBtn}>
                                        {next.label}
                                    </Button>
                                ) : (
                                    <Box />
                                )}
                            </Box>
                        </Box>
                    </Box>

                    <Footer />
                </Box>
            </Box>
        </ThemeProvider>
    );
}

const pillBtn = {
    textTransform: "none",
    fontWeight: 600,
    fontSize: "13px",
    px: 2,
    py: 0.5,
    minHeight: 38,
    borderRadius: "999px",
    border: "1px solid var(--app-border)",
    background: "var(--app-surface)",
    color: "var(--app-fg)",
    fontFamily: "var(--font-sofia-sans)",
    "&:hover": { bgcolor: "var(--app-overlay)", borderColor: "var(--app-fg)" },
};

const inkBtn = {
    ...pillBtn,
    border: "1px solid var(--app-ink)",
    background: "var(--app-ink)",
    color: "var(--app-on-ink)",
    "&:hover": { bgcolor: "var(--app-ink)", opacity: 0.88 },
};

const navBtn = {
    color: "var(--app-fg)",
    borderColor: "var(--app-fg)",
    textTransform: "none",
    fontWeight: 500,
    fontFamily: "var(--font-sofia-sans)",
    px: 2.5,
    py: 1,
    border: "1.5px solid",
    borderRadius: "999px",
    background: "var(--app-surface)",
    "&:hover": { borderColor: "var(--app-fg)", bgcolor: "var(--app-overlay)" },
};
