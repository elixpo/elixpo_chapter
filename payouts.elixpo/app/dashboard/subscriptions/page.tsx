"use client";

export const runtime = "edge";

import LaunchIcon from "@mui/icons-material/Launch";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Stack,
    Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { formatMoney, GlassCard } from "@/components/dashboard-ui";
import FlowDiagram from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";

const SYMBOLS: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
};

function rateLabel(rate: any): string {
    if (!rate) return "—";
    const per =
        rate.interval_count > 1
            ? `every ${rate.interval_count} ${rate.interval}s`
            : { day: "day", week: "week", month: "month", year: "year" }[
                  rate.interval as string
              ] || rate.interval;
    return `${formatMoney(rate.amount, rate.currency)} / ${per}`;
}

function fmtDate(s?: string | null): string {
    if (!s) return "—";
    const d = new Date(`${s.replace(" ", "T")}Z`);
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function SubscriptionsPage() {
    const [loading, setLoading] = useState(true);
    const [subs, setSubs] = useState<any[]>([]);

    useEffect(() => {
        fetch("/api/account/subscriptions", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : { subscriptions: [] }))
            .then((d: any) => setSubs(d.subscriptions || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "var(--app-accent)" }} />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 3 }}>
                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: "1.7rem",
                        letterSpacing: "-0.02em",
                    }}
                >
                    My subscriptions
                </Typography>
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.92rem",
                    }}
                >
                    What you're paying for across every app powered by Elixpo
                    Pay.
                </Typography>
            </Box>

            {subs.length === 0 ? (
                <GlassCard sx={{ textAlign: "center", py: 6 }}>
                    <Typography
                        sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 1 }}
                    >
                        No active subscriptions
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.9rem",
                        }}
                    >
                        When you subscribe to a product that uses Elixpo Pay,
                        it'll show up here with its rate and renewal date.
                    </Typography>
                </GlassCard>
            ) : (
                <Stack spacing={2}>
                    {subs.map((s) => (
                        <GlassCard
                            key={s.id}
                            sx={{ opacity: s.active ? 1 : 0.6 }}
                        >
                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                spacing={1.5}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        flexWrap="wrap"
                                    >
                                        <Typography
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: "1.1rem",
                                                color: "var(--app-fg)",
                                            }}
                                        >
                                            {s.app_name}
                                        </Typography>
                                        <Chip
                                            label={s.tier}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: "0.66rem",
                                                fontWeight: 700,
                                                color: "var(--app-accent)",
                                                bgcolor:
                                                    "color-mix(in srgb, var(--app-accent) 12%, transparent)",
                                                border: "1px solid color-mix(in srgb, var(--app-accent) 25%, transparent)",
                                            }}
                                        />
                                        <Chip
                                            label={
                                                s.cancelled
                                                    ? "Cancelled"
                                                    : s.active
                                                      ? "Active"
                                                      : s.status
                                            }
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: "0.62rem",
                                                fontWeight: 700,
                                                color: s.cancelled
                                                    ? "var(--app-danger)"
                                                    : s.active
                                                      ? "var(--app-success)"
                                                      : "var(--app-fg-faint)",
                                                bgcolor: s.cancelled
                                                    ? "color-mix(in srgb, var(--app-danger) 10%, transparent)"
                                                    : s.active
                                                      ? "color-mix(in srgb, var(--app-success) 12%, transparent)"
                                                      : "color-mix(in srgb, var(--app-fg-faint) 12%, transparent)",
                                                border: `1px solid ${
                                                    s.cancelled
                                                        ? "color-mix(in srgb, var(--app-danger) 30%, transparent)"
                                                        : s.active
                                                          ? "color-mix(in srgb, var(--app-success) 30%, transparent)"
                                                          : "color-mix(in srgb, var(--app-fg-faint) 25%, transparent)"
                                                }`,
                                            }}
                                        />
                                        <Chip
                                            label={
                                                s.billing_mode === "recurring"
                                                    ? "Auto-pay"
                                                    : "One-time"
                                            }
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: "0.62rem",
                                                fontWeight: 700,
                                                color:
                                                    s.billing_mode ===
                                                    "recurring"
                                                        ? "#5fb6ff"
                                                        : "var(--app-warn)",
                                                bgcolor:
                                                    s.billing_mode ===
                                                    "recurring"
                                                        ? "color-mix(in srgb, var(--app-accent) 10%, transparent)"
                                                        : "color-mix(in srgb, var(--app-warn) 10%, transparent)",
                                                border: `1px solid ${
                                                    s.billing_mode ===
                                                    "recurring"
                                                        ? "color-mix(in srgb, var(--app-accent) 30%, transparent)"
                                                        : "color-mix(in srgb, var(--app-warn) 30%, transparent)"
                                                }`,
                                            }}
                                        />
                                    </Stack>
                                    <Typography
                                        sx={{
                                            color: "var(--app-fg-muted)",
                                            fontSize: "0.86rem",
                                            mt: 0.6,
                                        }}
                                    >
                                        {s.product_name || s.tier}
                                        {s.homepage_url && (
                                            <Box
                                                component="a"
                                                href={s.homepage_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                sx={{
                                                    ml: 1,
                                                    color: "var(--app-accent)",
                                                    textDecoration: "none",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 0.3,
                                                    "&:hover": {
                                                        textDecoration:
                                                            "underline",
                                                    },
                                                }}
                                            >
                                                <LaunchIcon
                                                    sx={{ fontSize: 13 }}
                                                />{" "}
                                                Manage
                                            </Box>
                                        )}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--app-fg-faint)",
                                            fontSize: "0.78rem",
                                            mt: 0.5,
                                        }}
                                    >
                                        {s.cancelled && s.current_period_end
                                            ? `Access until ${fmtDate(s.current_period_end)} · no further charges`
                                            : s.cancelled
                                              ? "Cancelled · access ending"
                                              : s.active &&
                                                  s.billing_mode === "recurring"
                                                ? `Renews ${fmtDate(s.current_period_end)}`
                                                : s.active &&
                                                    s.billing_mode === "one_time"
                                                  ? `Expires ${fmtDate(s.current_period_end)} · renew manually`
                                                  : s.current_period_end
                                                    ? `Ended ${fmtDate(s.current_period_end)}`
                                                    : s.status === "pending"
                                                      ? "Pending mandate approval"
                                                      : ""}
                                    </Typography>
                                </Box>
                                <Box
                                    sx={{
                                        textAlign: { xs: "left", sm: "right" },
                                        flexShrink: 0,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontWeight: 800,
                                            fontSize: "1.15rem",
                                            color: "var(--app-fg)",
                                        }}
                                    >
                                        {rateLabel(s.rate)}
                                    </Typography>
                                    {s.rate?.nickname && (
                                        <Typography
                                            sx={{
                                                color: "var(--app-fg-faint)",
                                                fontSize: "0.74rem",
                                            }}
                                        >
                                            {s.rate.nickname}
                                        </Typography>
                                    )}
                                </Box>
                            </Stack>
                        </GlassCard>
                    ))}
                </Stack>
            )}

            <GlassCard sx={{ mt: 3 }}>
                <Typography
                    component="h2"
                    sx={{ fontWeight: 700, fontSize: "1rem", mb: 0.6, color: "var(--app-fg)" }}
                >
                    Cancelling auto-pay
                </Typography>
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.86rem",
                        lineHeight: 1.6,
                        mb: 2.5,
                    }}
                >
                    Auto-pay plans run on a UPI AutoPay or card e-mandate under RBI rules, processed by Razorpay, an RBI-regulated payment gateway. You can cancel any time: future renewals stop, and you keep access until the end of the period you already paid for.
                </Typography>
                <FlowDiagram
                    compact
                    title="What happens when you cancel"
                    steps={[
                        {
                            icon: "key",
                            title: "You cancel",
                            body: "Whenever you like, at any point in the period.",
                        },
                        {
                            icon: "shield",
                            title: "Renewals stop",
                            body: "No further auto-pay charges.",
                        },
                        {
                            icon: "check",
                            title: "Access continues",
                            body: "Until the end of the period you paid for.",
                        },
                    ]}
                />
                <PolicyLinks trust="buying"
                    lead="See our"
                    style={{ marginTop: "1.5rem" }}
                />
            </GlassCard>
        </Box>
    );
}
