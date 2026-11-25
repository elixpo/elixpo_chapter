"use client";

import type { InvoiceRow, TenantSubscription, TenantUsage } from "@/lib/billing";
import {
    type BillingCycle,
    type Currency,
    PLANS,
    type PlanId,
    getPlan,
    getYearlySavingsBadge,
} from "@/lib/plans";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReceiptIcon from "@mui/icons-material/Receipt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Snackbar,
    Stack,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GHOST_BTN, PRIMARY_BTN, PageHeader } from "../../components/dashboard-ui";
import { GlassCard } from "../../components/glass-card";

const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const ACCENT = "var(--accent)";
const BORDER = "var(--border)";
const SURFACE = "var(--surface)";

interface BillingClientProps {
    initialSubscription: TenantSubscription;
    initialUsage: TenantUsage;
    initialInvoices: InvoiceRow[];
}

function UsageMeter({
    label,
    used,
    limit,
    unit = "",
}: {
    label: string;
    used: number;
    limit: number | null;
    unit?: string;
}) {
    const isUnlimited = limit === null;
    const percentage = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
    const isNearLimit = !isUnlimited && percentage >= 80;
    const isOverLimit = !isUnlimited && used >= limit;

    const progressColor = isOverLimit ? "var(--danger)" : isNearLimit ? "#f59e0b" : "var(--accent)";

    return (
        <Box sx={{ py: 1.4, borderBottom: `1px solid ${BORDER}` }}>
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 0.8 }}
            >
                <Typography sx={{ fontSize: "0.88rem", color: "var(--fg-muted)", fontWeight: 500 }}>
                    {label}
                </Typography>
                <Typography
                    sx={{
                        fontSize: "0.86rem",
                        color: TEXT_55,
                        fontFamily: "var(--font-geist-mono)",
                    }}
                >
                    <Box component="span" sx={{ color: TEXT, fontWeight: 600 }}>
                        {used.toLocaleString()}
                    </Box>{" "}
                    / {isUnlimited ? "Unlimited" : `${limit.toLocaleString()} ${unit}`.trim()}
                </Typography>
            </Stack>
            {!isUnlimited && (
                <LinearProgress
                    variant="determinate"
                    value={percentage}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: "var(--overlay)",
                        "& .MuiLinearProgress-bar": {
                            bgcolor: progressColor,
                            borderRadius: 3,
                        },
                    }}
                />
            )}
        </Box>
    );
}

export default function BillingClient({
    initialSubscription,
    initialUsage,
    initialInvoices,
}: BillingClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [subscription, setSubscription] = useState<TenantSubscription>(initialSubscription);
    const [usage, setUsage] = useState<TenantUsage>(initialUsage);
    const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);

    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    // Plan change modal state
    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(
        initialSubscription.billingCycle,
    );
    const [selectedCurrency, setSelectedCurrency] = useState<Currency>(
        initialSubscription.billingCurrency,
    );

    // Cancel modal state
    const [cancelModalOpen, setCancelModalOpen] = useState(false);

    // Handle incoming URL parameters (e.g. from /pricing redirect)
    useEffect(() => {
        const queryPlan = searchParams.get("plan");
        const queryCycle = searchParams.get("cycle");
        const queryCurrency = searchParams.get("currency");
        const checkoutSuccess = searchParams.get("checkout") === "success";

        if (checkoutSuccess) {
            setToast({
                text: "Payment received — activating your plan…",
                ok: true,
            });
            // The plan flips when Elixpo Pay's signed grant webhook lands, which
            // can be a few seconds after the redirect. Poll briefly.
            let tries = 0;
            const timer = setInterval(async () => {
                tries++;
                const sub = await fetchBillingData();
                if ((sub && sub.plan !== "starter") || tries >= 10) {
                    clearInterval(timer);
                    setToast(
                        sub && sub.plan !== "starter"
                            ? {
                                  text: `You're on ${sub.planDefinition.name}. Welcome aboard!`,
                                  ok: true,
                              }
                            : {
                                  text: "Payment received. Your plan will update within a minute — refresh if it doesn't.",
                                  ok: true,
                              },
                    );
                }
            }, 2000);
            return () => clearInterval(timer);
        }

        if (queryPlan && (queryPlan === "pro" || queryPlan === "scale")) {
            setSelectedPlan(queryPlan as PlanId);
            if (queryCycle === "yearly" || queryCycle === "monthly") {
                setSelectedCycle(queryCycle);
            }
            if (queryCurrency === "INR" || queryCurrency === "USD") {
                setSelectedCurrency(queryCurrency);
            }
            setPlanModalOpen(true);
        }
    }, [searchParams]);

    const fetchBillingData = async (): Promise<TenantSubscription | null> => {
        try {
            const res = await fetch("/api/billing");
            const data: any = await res.json();
            if (res.ok && data?.ok) {
                if (data.subscription) setSubscription(data.subscription);
                if (data.usage) setUsage(data.usage);
                if (data.invoices) setInvoices(data.invoices);
                return data.subscription ?? null;
            }
        } catch {
            /* ignore */
        }
        return null;
    };

    const handleStartCheckout = async () => {
        setLoadingAction("checkout");
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    plan: selectedPlan,
                    cycle: selectedCycle,
                    currency: selectedCurrency,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                url?: string;
                message?: string;
                error?: string;
            };

            if (!res.ok || !data?.ok || !data.url) {
                throw new Error(data?.message || data?.error || "Failed to initiate checkout");
            }

            // Redirect to the Elixpo Pay hosted checkout
            window.location.href = data.url;
        } catch (e: any) {
            setToast({ text: e?.message || "Checkout failed", ok: false });
            setLoadingAction(null);
        }
    };

    const handleCancelSubscription = async () => {
        setLoadingAction("cancel");
        try {
            const res = await fetch("/api/billing/cancel", { method: "POST" });
            const data: any = await res.json();
            if (!res.ok || !data?.ok) throw new Error(data?.message || "Cancellation failed");

            setToast({
                text: "Your subscription has been scheduled to cancel at the end of the billing period.",
                ok: true,
            });
            setCancelModalOpen(false);
            fetchBillingData();
        } catch (e: any) {
            setToast({ text: e?.message || "Failed to cancel", ok: false });
        } finally {
            setLoadingAction(null);
        }
    };

    const plan = subscription.planDefinition;
    const pricing = plan.pricing[subscription.billingCurrency];
    const isYearly = subscription.billingCycle === "yearly";
    const currentPriceFormatted =
        plan.id === "starter"
            ? "Free"
            : isYearly
              ? `${pricing.effectiveMonthly}/mo (${pricing.formattedYearly}/yr)`
              : `${pricing.formattedMonthly}/mo`;

    const statusColor =
        subscription.subscriptionStatus === "active"
            ? "var(--success)"
            : subscription.subscriptionStatus === "past_due"
              ? "var(--danger)"
              : subscription.subscriptionStatus === "canceled"
                ? "var(--fg-faint)"
                : "#f59e0b";

    return (
        <Box>
            <PageHeader
                title="Billing & Plan"
                description="Manage your subscription, recurring auto-pay cycles in USD & INR, and sending allowances."
            />

            {/* Past due alert */}
            {subscription.subscriptionStatus === "past_due" && (
                <Alert
                    severity="error"
                    sx={{ mb: 3, borderRadius: "12px", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                    <AlertTitle sx={{ fontWeight: 700 }}>Payment past due</AlertTitle>
                    Your latest recurring payment failed. Please update your payment method to avoid
                    sending interruptions.
                </Alert>
            )}

            {/* Over send limit alert */}
            {usage.overSendLimit && (
                <Alert
                    severity="warning"
                    icon={<WarningAmberIcon sx={{ color: "#f59e0b" }} />}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                                setSelectedPlan("pro");
                                setPlanModalOpen(true);
                            }}
                            sx={{ fontWeight: 700, textTransform: "none" }}
                        >
                            Upgrade to Pro
                        </Button>
                    }
                    sx={{
                        mb: 3,
                        borderRadius: "12px",
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.3)",
                    }}
                >
                    <AlertTitle sx={{ fontWeight: 700 }}>Monthly send limit reached</AlertTitle>
                    You have reached the 1,000 monthly sends limit on the Starter plan. Deliveries
                    are paused until the next period or until you upgrade.
                </Alert>
            )}

            {/* Cancellation scheduled notice */}
            {subscription.cancelAtPeriodEnd && (
                <Alert
                    severity="info"
                    sx={{
                        mb: 3,
                        borderRadius: "12px",
                        background: "var(--overlay)",
                        border: `1px solid ${BORDER}`,
                    }}
                >
                    Your subscription will cancel at the end of the billing period
                    {subscription.currentPeriodEnd
                        ? ` on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                        : ""}
                    . You keep every {plan.name} feature until then, and can subscribe again any
                    time after.
                </Alert>
            )}

            <Box
                sx={{
                    display: "grid",
                    gap: 3,
                    gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" },
                    alignItems: "start",
                }}
            >
                {/* Current plan card */}
                <GlassCard
                    sx={{
                        background: "var(--accent-tint)",
                        border: "1px solid var(--accent-border)",
                    }}
                >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        sx={{ mb: 2 }}
                    >
                        <Box>
                            <Typography
                                sx={{
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: ACCENT,
                                    mb: 0.8,
                                }}
                            >
                                Current plan
                            </Typography>
                            <Stack direction="row" alignItems="baseline" spacing={1.2}>
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: "1.8rem",
                                        color: TEXT,
                                        letterSpacing: "-0.02em",
                                    }}
                                >
                                    {plan.name}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "1rem",
                                        color: plan.id === "starter" ? "var(--success)" : TEXT,
                                    }}
                                >
                                    {currentPriceFormatted}
                                </Typography>
                            </Stack>
                            {subscription.currentPeriodEnd && (
                                <Typography sx={{ fontSize: "0.8rem", color: TEXT_55, mt: 0.5 }}>
                                    Cycle: {subscription.billingCycle} (
                                    {subscription.billingCurrency}) · Next renewal:{" "}
                                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                </Typography>
                            )}
                        </Box>
                        <Chip
                            label={
                                subscription.cancelAtPeriodEnd
                                    ? "Canceling"
                                    : subscription.subscriptionStatus.toUpperCase()
                            }
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: statusColor,
                                bgcolor: "var(--overlay)",
                                border: `1px solid ${statusColor}`,
                            }}
                        />
                    </Stack>

                    <Box
                        sx={{
                            display: "grid",
                            gap: 1.2,
                            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            mb: 3,
                        }}
                    >
                        {plan.features.map((f) => (
                            <Stack key={f} direction="row" spacing={1} alignItems="center">
                                <CheckIcon
                                    sx={{ fontSize: 16, color: "var(--success)", flexShrink: 0 }}
                                />
                                <Typography sx={{ fontSize: "0.86rem", color: "var(--fg-muted)" }}>
                                    {f}
                                </Typography>
                            </Stack>
                        ))}
                    </Box>

                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.4}
                        sx={{ flexWrap: "wrap" }}
                    >
                        <Button
                            onClick={() => {
                                setSelectedPlan(plan.id === "starter" ? "pro" : plan.id);
                                setPlanModalOpen(true);
                            }}
                            endIcon={<ArrowForwardIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={{ ...PRIMARY_BTN, fontSize: "0.9rem" }}
                        >
                            {plan.id === "starter" ? "Upgrade plan" : "Change plan"}
                        </Button>

                        {plan.id !== "starter" && !subscription.cancelAtPeriodEnd && (
                            <Button
                                onClick={() => setCancelModalOpen(true)}
                                sx={{ ...GHOST_BTN, fontSize: "0.85rem", color: "var(--fg-faint)" }}
                            >
                                Cancel subscription
                            </Button>
                        )}

                        <Button
                            component={Link}
                            href="/pricing"
                            sx={{ ...GHOST_BTN, fontSize: "0.9rem" }}
                        >
                            Compare plans
                        </Button>
                    </Stack>
                </GlassCard>

                {/* Usage this period */}
                <GlassCard>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT, mb: 0.4 }}>
                        Usage this period
                    </Typography>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.82rem", mb: 1.5 }}>
                        Resets monthly ({new Date(usage.periodStart).toLocaleDateString()} –{" "}
                        {new Date(usage.periodEnd).toLocaleDateString()}).
                    </Typography>

                    <UsageMeter
                        label="Sends"
                        used={usage.sendsUsed}
                        limit={usage.sendsLimit}
                        unit="sends"
                    />
                    <UsageMeter
                        label="Products"
                        used={usage.productsUsed}
                        limit={usage.productsLimit}
                    />
                    <UsageMeter
                        label="Senders"
                        used={usage.sendersUsed}
                        limit={usage.sendersLimit}
                    />
                    <UsageMeter
                        label="Templates"
                        used={usage.templatesUsed}
                        limit={usage.templatesLimit}
                    />
                </GlassCard>
            </Box>

            {/* Invoices section */}
            <Box sx={{ mt: 5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: TEXT, mb: 1.5 }}>
                    Billing History & Invoices
                </Typography>
                {invoices.length > 0 ? (
                    <GlassCard sx={{ p: 0, overflow: "hidden" }}>
                        <Box sx={{ overflowX: "auto" }}>
                            <Box
                                component="table"
                                sx={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    fontSize: "0.88rem",
                                    "& th": {
                                        textAlign: "left",
                                        p: 2,
                                        color: TEXT_55,
                                        fontWeight: 600,
                                        borderBottom: `1px solid ${BORDER}`,
                                    },
                                    "& td": {
                                        p: 2,
                                        borderBottom: `1px solid ${BORDER}`,
                                        color: TEXT,
                                    },
                                }}
                            >
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Provider</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: "right" }}>Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((inv) => {
                                        const amountFormatted =
                                            inv.currency === "INR"
                                                ? `₹${(inv.amount / 100).toLocaleString()}`
                                                : `$${(inv.amount / 100).toFixed(2)}`;

                                        return (
                                            <tr key={inv.id}>
                                                <td>
                                                    {new Date(inv.created_at).toLocaleDateString()}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>
                                                    {amountFormatted}
                                                </td>
                                                <td>
                                                    <Chip
                                                        label={inv.provider.toUpperCase()}
                                                        size="small"
                                                        sx={{
                                                            height: 20,
                                                            fontSize: "0.68rem",
                                                            fontWeight: 600,
                                                            bgcolor: "var(--overlay)",
                                                        }}
                                                    />
                                                </td>
                                                <td>
                                                    <Chip
                                                        label={inv.status.toUpperCase()}
                                                        size="small"
                                                        sx={{
                                                            height: 20,
                                                            fontSize: "0.68rem",
                                                            fontWeight: 700,
                                                            color:
                                                                inv.status === "paid"
                                                                    ? "var(--success)"
                                                                    : "var(--danger)",
                                                            bgcolor: "var(--overlay)",
                                                        }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                    {inv.pdf_url || inv.hosted_invoice_url ? (
                                                        <Button
                                                            component="a"
                                                            href={
                                                                inv.pdf_url ||
                                                                inv.hosted_invoice_url ||
                                                                "#"
                                                            }
                                                            target="_blank"
                                                            size="small"
                                                            startIcon={
                                                                <ReceiptIcon
                                                                    sx={{ fontSize: 16 }}
                                                                />
                                                            }
                                                            endIcon={
                                                                <OpenInNewIcon
                                                                    sx={{ fontSize: 12 }}
                                                                />
                                                            }
                                                            sx={{
                                                                textTransform: "none",
                                                                fontSize: "0.78rem",
                                                            }}
                                                        >
                                                            Invoice
                                                        </Button>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Box>
                        </Box>
                    </GlassCard>
                ) : (
                    <GlassCard sx={{ p: 4, textAlign: "center" }}>
                        <ReceiptIcon sx={{ fontSize: 36, color: "var(--fg-faint)", mb: 1 }} />
                        <Typography sx={{ color: TEXT_55, fontSize: "0.9rem" }}>
                            No invoice records yet. Paid charges and recurring renewals will appear
                            here.
                        </Typography>
                    </GlassCard>
                )}
            </Box>

            {/* Change Plan Dialog */}
            <Dialog
                open={planModalOpen}
                onClose={() => setPlanModalOpen(false)}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {
                        sx: {
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: "16px",
                            backgroundImage: "none",
                            p: 1,
                        },
                    },
                }}
            >
                <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.25rem", pb: 0.5 }}>
                    Select Plan & Billing Cycle
                </DialogTitle>
                <Typography sx={{ px: 3, pb: 2, fontSize: "0.84rem", color: TEXT_55 }}>
                    Choose your plan tier, billing frequency, and preferred payment currency.
                </Typography>
                <DialogContent sx={{ pt: 1 }}>
                    {/* Controls: Cycle + Currency */}
                    <Stack
                        direction="row"
                        spacing={2}
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 3 }}
                    >
                        {/* Cycle */}
                        <Box
                            sx={{
                                display: "inline-flex",
                                p: "4px",
                                borderRadius: "24px",
                                bgcolor: "var(--overlay)",
                                border: `1px solid ${BORDER}`,
                            }}
                        >
                            <Button
                                size="small"
                                onClick={() => setSelectedCycle("monthly")}
                                sx={{
                                    textTransform: "none",
                                    borderRadius: "20px",
                                    px: 1.8,
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    bgcolor:
                                        selectedCycle === "monthly" ? "var(--fg)" : "transparent",
                                    color: selectedCycle === "monthly" ? "var(--bg)" : TEXT_55,
                                    "&:hover": {
                                        bgcolor:
                                            selectedCycle === "monthly"
                                                ? "var(--fg)"
                                                : "transparent",
                                    },
                                }}
                            >
                                Monthly
                            </Button>
                            <Button
                                size="small"
                                onClick={() => setSelectedCycle("yearly")}
                                sx={{
                                    textTransform: "none",
                                    borderRadius: "20px",
                                    px: 1.8,
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    bgcolor:
                                        selectedCycle === "yearly" ? "var(--fg)" : "transparent",
                                    color: selectedCycle === "yearly" ? "var(--bg)" : TEXT_55,
                                    "&:hover": {
                                        bgcolor:
                                            selectedCycle === "yearly"
                                                ? "var(--fg)"
                                                : "transparent",
                                    },
                                }}
                            >
                                Yearly (-17%)
                            </Button>
                        </Box>

                        {/* Currency */}
                        <Box
                            sx={{
                                display: "inline-flex",
                                p: "4px",
                                borderRadius: "24px",
                                bgcolor: "var(--overlay)",
                                border: `1px solid ${BORDER}`,
                            }}
                        >
                            <Button
                                size="small"
                                onClick={() => setSelectedCurrency("USD")}
                                sx={{
                                    textTransform: "none",
                                    borderRadius: "20px",
                                    px: 1.5,
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    bgcolor:
                                        selectedCurrency === "USD" ? "var(--fg)" : "transparent",
                                    color: selectedCurrency === "USD" ? "var(--bg)" : TEXT_55,
                                    "&:hover": {
                                        bgcolor:
                                            selectedCurrency === "USD"
                                                ? "var(--fg)"
                                                : "transparent",
                                    },
                                }}
                            >
                                USD ($)
                            </Button>
                            <Button
                                size="small"
                                onClick={() => setSelectedCurrency("INR")}
                                sx={{
                                    textTransform: "none",
                                    borderRadius: "20px",
                                    px: 1.5,
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    bgcolor:
                                        selectedCurrency === "INR" ? "var(--fg)" : "transparent",
                                    color: selectedCurrency === "INR" ? "var(--bg)" : TEXT_55,
                                    "&:hover": {
                                        bgcolor:
                                            selectedCurrency === "INR"
                                                ? "var(--fg)"
                                                : "transparent",
                                    },
                                }}
                            >
                                INR (₹)
                            </Button>
                        </Box>
                    </Stack>

                    {/* Plan selection options */}
                    <Stack spacing={2}>
                        {(["pro", "scale"] as PlanId[]).map((pId) => {
                            const p = PLANS[pId];
                            const priceInfo = p.pricing[selectedCurrency];
                            const isSelected = selectedPlan === pId;
                            const priceStr =
                                selectedCycle === "yearly"
                                    ? `${priceInfo.effectiveMonthly}/mo (billed ${priceInfo.formattedYearly}/yr)`
                                    : `${priceInfo.formattedMonthly}/mo`;

                            return (
                                <Box
                                    key={pId}
                                    onClick={() => setSelectedPlan(pId)}
                                    sx={{
                                        p: 2.2,
                                        borderRadius: "12px",
                                        border: isSelected
                                            ? `2px solid ${ACCENT}`
                                            : `1px solid ${BORDER}`,
                                        bgcolor: isSelected
                                            ? "var(--accent-tint)"
                                            : "var(--overlay)",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                    }}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                    >
                                        <Box>
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: "1.05rem",
                                                    color: TEXT,
                                                }}
                                            >
                                                {p.name}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.82rem",
                                                    color: TEXT_55,
                                                    mt: 0.3,
                                                }}
                                            >
                                                {p.blurb}
                                            </Typography>
                                        </Box>
                                        <Typography
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: "0.95rem",
                                                color: TEXT,
                                            }}
                                        >
                                            {priceStr}
                                        </Typography>
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Stack>

                    <Typography sx={{ fontSize: "0.78rem", color: "var(--fg-faint)", mt: 2.5 }}>
                        {selectedCurrency === "INR"
                            ? "Secure auto-pay through Elixpo Pay — UPI AutoPay and cards, RBI e-mandate compliant."
                            : "Secure auto-pay through Elixpo Pay — international credit & debit cards."}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                    <Button onClick={() => setPlanModalOpen(false)} sx={GHOST_BTN}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleStartCheckout}
                        disabled={loadingAction === "checkout"}
                        startIcon={
                            loadingAction === "checkout" ? (
                                <CircularProgress size={16} />
                            ) : (
                                <CreditCardIcon />
                            )
                        }
                        sx={{ ...PRIMARY_BTN, minWidth: 140 }}
                    >
                        {loadingAction === "checkout" ? "Preparing…" : "Proceed to Checkout"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Cancel Confirmation Dialog */}
            <Dialog
                open={cancelModalOpen}
                onClose={() => setCancelModalOpen(false)}
                fullWidth
                maxWidth="xs"
                slotProps={{
                    paper: {
                        sx: {
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            borderRadius: "16px",
                            backgroundImage: "none",
                        },
                    },
                }}
            >
                <DialogTitle sx={{ color: TEXT, fontWeight: 700 }}>
                    Cancel Subscription?
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: "0.88rem", color: TEXT_55, lineHeight: 1.5 }}>
                        Your subscription will remain active until the end of your prepaid billing
                        period. You will not be charged again, and your workspace will revert to the
                        free Starter plan when it expires.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                    <Button onClick={() => setCancelModalOpen(false)} sx={GHOST_BTN}>
                        Keep Subscription
                    </Button>
                    <Button
                        onClick={handleCancelSubscription}
                        disabled={loadingAction === "cancel"}
                        sx={{
                            ...PRIMARY_BTN,
                            background: "var(--danger)",
                            "&:hover": { background: "rgba(239,68,68,0.8)" },
                        }}
                    >
                        {loadingAction === "cancel" ? "Canceling…" : "Confirm Cancel"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Notification Toast */}
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={6000}
                onClose={(_e, reason) => reason !== "clickaway" && setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={toast?.text}
            />
        </Box>
    );
}
