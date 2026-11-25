"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BusinessIcon from "@mui/icons-material/Business";
import Check from "@mui/icons-material/Check";
import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import {
    type BillingCycle,
    type Currency,
    PLANS,
    type PlanId,
    getYearlySavingsBadge,
} from "../../src/lib/plans";
import PageShell from "../components/page-shell";
import PricingFaq, { type Faq } from "../components/pricing-faq";

const CORAL = "var(--accent)";
const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

const PRIMARY_BTN = {
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

const OUTLINE_BTN = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: "var(--fg)",
    px: 3,
    py: 1.1,
    borderRadius: "32px", // Pill outline
    border: "1px solid var(--border)",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--overlay)", borderColor: "var(--fg)" },
};

const FAQS: Faq[] = [
    {
        q: "What payment methods and currencies are supported?",
        a: "Billing runs on Elixpo Pay, the payments layer of the Elixpo ecosystem. Pay in INR with UPI AutoPay, cards, or net banking (RBI e-mandate compliant), or in USD with international credit and debit cards. Receipts land in your inbox after every charge.",
    },
    {
        q: "How does the yearly discount work?",
        a: "Yearly subscriptions include approximately 2 months free (~17% discount compared to monthly billing). You pay once per year and receive full sending allowances every month.",
    },
    {
        q: "What happens if I reach my monthly send limit?",
        a: "On the free Starter plan, sends are blocked once you reach 1,000 deliveries until your next billing cycle resets or you upgrade to Pro. On paid plans (Pro & Scale), we provide advance usage notices and allow seamless plan upgrades.",
    },
    {
        q: "Can I switch plans or cancel anytime?",
        a: "Yes. You can upgrade, downgrade, or cancel from your dashboard billing settings. When you cancel, your plan remains active until the end of your prepaid billing period without further auto-debit.",
    },
    {
        q: "Do I bring my own sender mailbox?",
        a: "Yes. You connect your own mailbox — an email address and an app password — and we relay through it. Your domain, your sender reputation. Credentials are encrypted at rest with AES-GCM.",
    },
    {
        q: "What if I need custom send volume or dedicated SLA?",
        a: "Reach out about Enterprise. We offer custom high-volume send allowances, dedicated Slack support, SOC 2 compliance reports, and tailored terms.",
    },
];

interface TierDisplayProps {
    planId: PlanId;
    cycle: BillingCycle;
    currency: Currency;
}

function TierCard({ planId, cycle, currency }: TierDisplayProps) {
    const plan = PLANS[planId];
    const pricing = plan.pricing[currency];
    const isYearly = cycle === "yearly";

    let displayPrice = pricing.formattedMonthly;
    let billedText = "";

    if (planId === "starter") {
        displayPrice = pricing.formattedMonthly;
    } else if (isYearly) {
        displayPrice = pricing.effectiveMonthly;
        billedText = `Billed ${pricing.formattedYearly}/yr`;
    }

    const ctaHref =
        planId === "starter"
            ? "/api/auth/login"
            : `/dashboard/billing?plan=${planId}&cycle=${cycle}&currency=${currency}`;

    const ctaText =
        planId === "starter" ? "Get started" : planId === "pro" ? "Start Pro" : "Start Scale";

    return (
        <Box
            sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                borderRadius: "16px",
                p: { xs: 3.5, md: 4 },
                background: "var(--surface)",
                border: plan.popular ? `2px solid ${INK}` : `1px solid ${HAIRLINE}`,
                boxShadow: "none",
                height: "100%",
            }}
        >
            {plan.popular && (
                <Chip
                    label="Popular"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: -12,
                        left: 24,
                        height: 22,
                        fontSize: "0.68rem",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        color: "var(--bg)",
                        background: INK,
                        borderRadius: "4px",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                    }}
                />
            )}
            <Typography
                sx={{
                    fontWeight: 500,
                    fontSize: "1.25rem",
                    color: INK,
                    fontFamily: "var(--font-display)",
                }}
            >
                {plan.name}
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={0.6} sx={{ mt: 2 }}>
                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: "2.8rem",
                        color: INK,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                        fontFamily: "var(--font-display)",
                    }}
                >
                    {displayPrice}
                </Typography>
                <Typography sx={{ color: SLATE, fontSize: "0.95rem", fontWeight: 500 }}>
                    /mo
                </Typography>
            </Stack>
            {billedText ? (
                <Typography
                    sx={{
                        color: "var(--accent)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        mt: 0.6,
                        fontFamily: "var(--font-mono)",
                    }}
                >
                    {billedText}
                </Typography>
            ) : (
                <Box sx={{ height: "1.25rem", mt: 0.6 }} />
            )}
            <Typography
                sx={{
                    color: SLATE,
                    fontSize: "0.9rem",
                    lineHeight: 1.55,
                    mt: 1.5,
                    minHeight: { md: 48 },
                }}
            >
                {plan.blurb}
            </Typography>

            <Button
                component="a"
                href={ctaHref}
                endIcon={<ArrowForwardIcon sx={{ fontSize: "1rem !important" }} />}
                fullWidth
                sx={{ ...(plan.popular ? PRIMARY_BTN : OUTLINE_BTN), mt: 3.5, py: 1.2 }}
            >
                {ctaText}
            </Button>

            <Stack spacing={1.6} sx={{ mt: 4.5, borderTop: `1px solid ${HAIRLINE}`, pt: 3.5 }}>
                {plan.features.map((f) => (
                    <Stack key={f} direction="row" spacing={1.5} alignItems="flex-start">
                        <Check sx={{ fontSize: 16, color: CORAL, mt: "2px", flexShrink: 0 }} />
                        <Typography sx={{ color: INK, fontSize: "0.88rem", lineHeight: 1.5 }}>
                            {f}
                        </Typography>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}

export default function PricingClient() {
    const [cycle, setCycle] = useState<BillingCycle>("monthly");
    const [currency, setCurrency] = useState<Currency>("USD");

    // Persist and auto-detect currency by region/locale
    useEffect(() => {
        try {
            const saved = localStorage.getItem("elixpo_billing_currency");
            if (saved === "INR" || saved === "USD") {
                setCurrency(saved);
                return;
            }

            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            const lang = typeof navigator !== "undefined" ? navigator.language : "";
            if (
                tz.toLowerCase().includes("kolkata") ||
                tz.toLowerCase().includes("calcutta") ||
                lang.toLowerCase().includes("-in")
            ) {
                setCurrency("INR");
            }
        } catch {
            // fallback USD
        }
    }, []);

    const handleCurrencyChange = (newCur: Currency) => {
        setCurrency(newCur);
        try {
            localStorage.setItem("elixpo_billing_currency", newCur);
        } catch {
            /* ignore */
        }
    };

    return (
        <PageShell variant="default">
            <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 10 } }}>
                {/* Heading */}
                <Stack
                    alignItems="center"
                    textAlign="center"
                    spacing={2.5}
                    sx={{ mb: { xs: 5, md: 7 } }}
                >
                    <Typography
                        sx={{
                            color: CORAL,
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            fontWeight: 500,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                        }}
                    >
                        Pricing
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 510,
                            fontSize: { xs: "3rem", md: "clamp(3.8rem,6vw,5.8rem)" },
                            letterSpacing: "-0.068em",
                            lineHeight: 0.93,
                            color: INK,
                            maxWidth: 780,
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Simple pricing that scales with your sending.
                    </Typography>
                    <Typography
                        sx={{
                            maxWidth: 580,
                            color: SLATE,
                            fontSize: { xs: "1rem", md: "1.12rem" },
                            lineHeight: 1.65,
                        }}
                    >
                        Start free, bring your own sender, and only pay as your transactional volume
                        grows. Auto-pay in USD and INR with zero hassle.
                    </Typography>
                </Stack>

                {/* Switchers: Billing Cycle + Currency */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    justifyContent="center"
                    alignItems="center"
                    sx={{ mb: { xs: 5, md: 7 } }}
                >
                    {/* Monthly / Yearly cycle toggle */}
                    <Box
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            p: "4px",
                            borderRadius: "32px",
                            background: "var(--surface)",
                            border: `1px solid ${HAIRLINE}`,
                        }}
                    >
                        <Button
                            onClick={() => setCycle("monthly")}
                            sx={{
                                textTransform: "none",
                                borderRadius: "28px",
                                px: 2.2,
                                py: 0.6,
                                fontSize: "0.86rem",
                                fontWeight: cycle === "monthly" ? 600 : 500,
                                color: cycle === "monthly" ? "var(--bg)" : SLATE,
                                background: cycle === "monthly" ? INK : "transparent",
                                "&:hover": {
                                    background: cycle === "monthly" ? INK : "var(--overlay)",
                                },
                            }}
                        >
                            Monthly
                        </Button>
                        <Button
                            onClick={() => setCycle("yearly")}
                            sx={{
                                textTransform: "none",
                                borderRadius: "28px",
                                px: 2,
                                py: 0.6,
                                fontSize: "0.86rem",
                                fontWeight: cycle === "yearly" ? 600 : 500,
                                color: cycle === "yearly" ? "var(--bg)" : SLATE,
                                background: cycle === "yearly" ? INK : "transparent",
                                display: "flex",
                                alignItems: "center",
                                gap: 0.8,
                                "&:hover": {
                                    background: cycle === "yearly" ? INK : "var(--overlay)",
                                },
                            }}
                        >
                            Yearly
                            <Box
                                component="span"
                                sx={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    px: 0.9,
                                    py: 0.2,
                                    borderRadius: "12px",
                                    bgcolor:
                                        cycle === "yearly"
                                            ? "rgba(255,255,255,0.25)"
                                            : "var(--accent-tint)",
                                    color: cycle === "yearly" ? "var(--bg)" : "var(--accent)",
                                }}
                            >
                                -17%
                            </Box>
                        </Button>
                    </Box>

                    {/* Currency toggle: USD / INR */}
                    <Box
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            p: "4px",
                            borderRadius: "32px",
                            background: "var(--surface)",
                            border: `1px solid ${HAIRLINE}`,
                        }}
                    >
                        <Button
                            onClick={() => handleCurrencyChange("USD")}
                            sx={{
                                textTransform: "none",
                                borderRadius: "28px",
                                px: 2,
                                py: 0.6,
                                fontSize: "0.86rem",
                                fontWeight: currency === "USD" ? 600 : 500,
                                color: currency === "USD" ? "var(--bg)" : SLATE,
                                background: currency === "USD" ? INK : "transparent",
                                "&:hover": {
                                    background: currency === "USD" ? INK : "var(--overlay)",
                                },
                            }}
                        >
                            USD ($)
                        </Button>
                        <Button
                            onClick={() => handleCurrencyChange("INR")}
                            sx={{
                                textTransform: "none",
                                borderRadius: "28px",
                                px: 2,
                                py: 0.6,
                                fontSize: "0.86rem",
                                fontWeight: currency === "INR" ? 600 : 500,
                                color: currency === "INR" ? "var(--bg)" : SLATE,
                                background: currency === "INR" ? INK : "transparent",
                                "&:hover": {
                                    background: currency === "INR" ? INK : "var(--overlay)",
                                },
                            }}
                        >
                            INR (₹)
                        </Button>
                    </Box>
                </Stack>

                {/* Savings announcement banner if yearly selected */}
                {cycle === "yearly" && (
                    <Box sx={{ textAlign: "center", mb: 3 }}>
                        <Typography
                            sx={{
                                display: "inline-block",
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                color: "var(--accent)",
                                background: "var(--accent-tint)",
                                px: 2,
                                py: 0.5,
                                borderRadius: "16px",
                                border: "1px solid var(--accent-border)",
                            }}
                        >
                            🎉 {getYearlySavingsBadge()} applied across all plans
                        </Typography>
                    </Box>
                )}

                {/* Tier cards */}
                <Box
                    sx={{
                        display: "grid",
                        gap: 3.5,
                        gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                        alignItems: "stretch",
                        mt: 1,
                    }}
                >
                    <TierCard planId="starter" cycle={cycle} currency={currency} />
                    <TierCard planId="pro" cycle={cycle} currency={currency} />
                    <TierCard planId="scale" cycle={cycle} currency={currency} />
                </Box>
            </Container>

            {/* Enterprise Strip: Soft Stone panel with thin rule boundaries */}
            <Container maxWidth="lg" sx={{ pb: { xs: 6, md: 8 } }}>
                <Box
                    sx={{
                        borderRadius: "22px",
                        border: `1px solid ${HAIRLINE}`,
                        background: "var(--surface-3)",
                        p: { xs: 3.5, md: 5 },
                        display: "flex",
                        flexDirection: { xs: "column", md: "row" },
                        alignItems: { xs: "flex-start", md: "center" },
                        justifyContent: "space-between",
                        gap: 3.5,
                    }}
                >
                    <Stack direction="row" spacing={2.5} alignItems="flex-start">
                        <Box
                            sx={{
                                width: 52,
                                height: 52,
                                borderRadius: "14px",
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                                color: CORAL,
                                background: "var(--accent-tint)",
                                border: "1px solid var(--accent-border)",
                            }}
                        >
                            <BusinessIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                            <Typography
                                sx={{
                                    fontWeight: 500,
                                    fontSize: "1.3rem",
                                    color: INK,
                                    mb: 0.8,
                                    fontFamily: "var(--font-display)",
                                }}
                            >
                                Enterprise
                            </Typography>
                            <Typography
                                sx={{
                                    color: SLATE,
                                    fontSize: "0.95rem",
                                    lineHeight: 1.6,
                                    maxWidth: 580,
                                }}
                            >
                                Custom send volume, dedicated support, security review, and tailored
                                terms for high-scale and regulated workloads.
                            </Typography>
                        </Box>
                    </Stack>
                    <Button
                        component="a"
                        href="mailto:hello@elixpo.com"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: "1rem !important" }} />}
                        sx={{ ...OUTLINE_BTN, flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                        Contact sales
                    </Button>
                </Box>
            </Container>

            {/* FAQ: Clean rule-separated list */}
            <Container
                maxWidth="md"
                sx={{ py: { xs: 6, md: 10 }, borderTop: `1px solid ${HAIRLINE}` }}
            >
                <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ mb: 6 }}>
                    <Typography
                        sx={{
                            color: CORAL,
                            fontWeight: 500,
                            fontSize: "0.78rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        FAQ
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "1.8rem", md: "2.4rem" },
                            letterSpacing: "-0.02em",
                            color: INK,
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Questions, answered
                    </Typography>
                </Stack>

                <PricingFaq items={FAQS} />
            </Container>
        </PageShell>
    );
}
