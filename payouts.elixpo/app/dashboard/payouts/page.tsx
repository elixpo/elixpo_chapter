"use client";

export const runtime = "edge";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { formatMoney, GlassCard } from "@/components/dashboard-ui";
import FlowDiagram from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";

const field = {
    "& .MuiOutlinedInput-root": {
        color: "var(--app-fg)",
        background: "var(--app-overlay)",
        "& fieldset": { borderColor: "var(--app-border)" },
        "&:hover fieldset": { borderColor: "color-mix(in srgb, var(--app-accent) 40%, transparent)" },
        "&.Mui-focused fieldset": { borderColor: "var(--app-accent)" },
    },
    "& .MuiInputLabel-root": { color: "var(--app-fg-muted)" },
};

const labelSx = {
    fontSize: "0.7rem",
    color: "var(--app-fg-faint)",
    textTransform: "uppercase",
    letterSpacing: "0.14em", fontFamily: "var(--font-geist-mono)",
    mb: 0.5,
};

export default function PayoutsPage() {
    const [loading, setLoading] = useState(true);
    const [account, setAccount] = useState<any>(null);
    const [routable, setRoutable] = useState<any[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [feeBps, setFeeBps] = useState(0);

    const [beneficiary, setBeneficiary] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [ifsc, setIfsc] = useState("");
    // KYC, sent to Razorpay once and never stored by Elixpo.
    const [phone, setPhone] = useState("");
    const [pan, setPan] = useState("");
    const [street, setStreet] = useState("");
    const [city, setCity] = useState("");
    const [stateName, setStateName] = useState("");
    const [postal, setPostal] = useState("");
    const [purpose, setPurpose] = useState<"fundraising" | "selling">("fundraising");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [createError, setCreateError] = useState("");
    const [saved, setSaved] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);

    const load = async () => {
        const r = await fetch("/api/dashboard/payouts", { credentials: "include" });
        if (r.ok) {
            const d: any = await r.json();
            setAccount(d.account);
            setRoutable(d.routable || []);
            setIsOwner(!!d.is_platform_owner);
            setFeeBps(d.platform_commission_bps || 0);
            if (d.account) {
                setBeneficiary(d.account.beneficiary_name || "");
                setIfsc(d.account.bank_ifsc || "");
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const save = async () => {
        setBusy(true);
        setErr("");
        setCreateError("");
        setSaved(false);
        try {
            const r = await fetch("/api/dashboard/payouts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    beneficiary_name: beneficiary.trim(),
                    account_number: accountNumber.trim(),
                    ifsc: ifsc.trim(),
                    phone: phone.trim(),
                    pan: pan.trim(),
                    street: street.trim(),
                    city: city.trim(),
                    state: stateName.trim(),
                    postal_code: postal.trim(),
                    purpose,
                }),
            });
            const d: any = await r.json().catch(() => ({}));
            if (d.error === "reauth_required") {
                window.location.href = "/login?next=%2Fdashboard%2Fpayouts";
                return;
            }
            if (r.status === 422 && d.create_error) {
                setCreateError(d.create_error);
                await load();
                return;
            }
            if (!r.ok) {
                throw new Error(
                    {
                        missing_beneficiary: "Enter the account holder name exactly as on your PAN (letters, numbers, spaces).",
                        invalid_phone: "Enter a 10-digit Indian mobile number.",
                        invalid_pan: "Enter your personal PAN (10 characters, 4th letter P).",
                        invalid_address: "Enter your full address (street at least 10 characters, city and state).",
                        invalid_postal_code: "Enter a 6-digit PIN code.",
                        invalid_ifsc: "That IFSC doesn't look right.",
                        invalid_account_number: "Enter a valid account number.",
                    }[d.error as string] || d.error_description || d.error || "failed",
                );
            }
            setAccountNumber("");
            setPan("");
            setSaved(true);
            // Razorpay couldn't create the linked account (e.g. KYC/details) —
            // saved as pending; show why so the merchant can fix it.
            if (d.create_error) setCreateError(d.create_error);
            await load();
        } catch (e: any) {
            setErr(e?.message || "Could not save");
        } finally {
            setBusy(false);
        }
    };

    const disconnect = async () => {
        setBusy(true);
        const r = await fetch("/api/dashboard/payouts", { method: "DELETE", credentials: "include" });
        const d: any = await r.json().catch(() => ({}));
        if (d.error === "reauth_required") {
            window.location.href = "/login?next=%2Fdashboard%2Fpayouts";
            return;
        }
        setConfirmDisconnect(false);
        setAccount(null);
        setBeneficiary("");
        setIfsc("");
        setBusy(false);
        await load();
    };

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "var(--app-accent)" }} />
            </Box>
        );
    }

    const connected = !!account;
    const active = account?.status === "active";
    const selfAcct = account?.status === "self";
    // Fee comes from the API; fall back to the standard 5% while it is unset.
    const feePct = feeBps ? (feeBps / 100).toFixed(feeBps % 100 ? 1 : 0) : "5";
    const sharePct = feeBps ? ((10000 - feeBps) / 100).toFixed(feeBps % 100 ? 1 : 0) : "95";

    return (
        <Box>
            <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>
                    Payouts
                </Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.92rem" }}>
                    Connect your bank to receive your app's revenue. Once live, each payment
                    is split to you automatically — you get the amount minus a{" "}
                    <Box component="span" sx={{ color: "var(--app-accent)", fontWeight: 600 }}>
                        {(feeBps / 100).toFixed(feeBps % 100 ? 1 : 0)}% platform fee
                    </Box>
                    .
                </Typography>
            </Box>

            {isOwner ? (
                <GlassCard>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <AccountBalanceIcon sx={{ color: "var(--app-success)", mt: 0.3 }} />
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                                Your products settle directly
                            </Typography>
                            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.88rem", mt: 0.5, maxWidth: 560 }}>
                                You're the platform owner, so revenue from your own products lands
                                straight in the Elixpo Razorpay account — no payout connection
                                needed. Connecting a bank is for third-party merchants whose
                                products are split to them.
                            </Typography>
                        </Box>
                    </Stack>
                    {routable.length > 0 && (
                        <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mt: 2.5 }}>
                            {routable.map((r: any) => (
                                <Box key={r.currency}>
                                    <Typography sx={{ fontWeight: 800, fontSize: "1.4rem" }}>
                                        {formatMoney(r.total, r.currency)}
                                    </Typography>
                                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.76rem" }}>
                                        {r.count} payment{r.count === 1 ? "" : "s"} · {r.currency}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </GlassCard>
            ) : (
              <>
            {/* Status */}
            {connected && (
                <GlassCard sx={{ mb: 2, border: `1px solid ${selfAcct ? "color-mix(in srgb, var(--app-accent) 35%, transparent)" : active ? "color-mix(in srgb, var(--app-success) 30%, transparent)" : "color-mix(in srgb, var(--app-warn) 30%, transparent)"}` }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <AccountBalanceIcon sx={{ color: selfAcct ? "var(--app-accent)" : active ? "var(--app-success)" : "var(--app-warn)" }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography sx={{ fontWeight: 700 }}>
                                    {account.beneficiary_name}
                                </Typography>
                                <Chip
                                    label={selfAcct ? "Self" : active ? "Active" : account.status === "disabled" ? "Paused" : account.activation_status === "needs_clarification" ? "Action needed" : account.activation_status ? "In review" : "Pending"}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: "0.62rem",
                                        fontWeight: 700,
                                        color: selfAcct ? "var(--app-accent)" : active ? "var(--app-success)" : "var(--app-warn)",
                                        bgcolor: selfAcct ? "color-mix(in srgb, var(--app-accent) 12%, transparent)" : active ? "color-mix(in srgb, var(--app-success) 12%, transparent)" : "color-mix(in srgb, var(--app-warn) 12%, transparent)",
                                        border: `1px solid ${selfAcct ? "color-mix(in srgb, var(--app-accent) 30%, transparent)" : active ? "color-mix(in srgb, var(--app-success) 30%, transparent)" : "color-mix(in srgb, var(--app-warn) 30%, transparent)"}`,
                                    }}
                                />
                            </Stack>
                            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", mt: 0.2 }}>
                                {account.bank_ifsc} · A/C ••••{account.bank_last4}

                            </Typography>
                        </Box>
                    </Stack>
                    {selfAcct ? (
                        <Typography sx={{ color: "var(--app-accent)", fontSize: "0.8rem", mt: 1.4 }}>
                            These details match the platform's own bank — marked as{" "}
                            <strong>Self</strong>, so payments settle directly (no split).
                            Ownership verification is required before this is finalised.
                        </Typography>
                    ) : (
                        !active && (
                            <Typography sx={{ color: "color-mix(in srgb, var(--app-warn) 85%, transparent)", fontSize: "0.8rem", mt: 1.4 }}>
                                {account.status === "disabled"
                                    ? "Payouts are paused. Connect again below to resume them."
                                    : account.activation_status === "needs_clarification"
                                      ? `Razorpay needs more from you: ${account.activation_note || "check your details below and submit again"}.`
                                      : account.kyc_submitted
                                        ? "Razorpay is verifying your details, usually within 1 to 2 working days. Fundraisers can be published and splits start as soon as it is approved."
                                        : "Finish connecting below. Until then, payments can't be split to you."}
                            </Typography>
                        )
                    )}
                </GlassCard>
            )}

            {/* Connect / edit form */}
            <GlassCard>
                <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 0.3 }}>
                    {connected ? "Update bank details" : "Connect your bank"}
                </Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", mb: 2 }}>
                    Razorpay, our RBI-regulated payment partner, verifies these once (KYC) and
                    pays you directly. Your PAN, phone and address go only to Razorpay; we keep
                    just the last 4 digits of your account number, for display.
                </Typography>
                <Stack spacing={1.8}>
                    {!account?.kyc_submitted && (
                        <>
                            <Box>
                                <Typography sx={labelSx}>What will you use payouts for?</Typography>
                                <Stack direction="row" spacing={1}>
                                    {(
                                        [
                                            ["fundraising", "Fundraisers"],
                                            ["selling", "Selling my app or product"],
                                        ] as const
                                    ).map(([v, l]) => (
                                        <Button
                                            key={v}
                                            onClick={() => setPurpose(v)}
                                            aria-pressed={purpose === v}
                                            sx={{
                                                textTransform: "none",
                                                fontWeight: 600,
                                                borderRadius: "999px",
                                                px: 2,
                                                border: "1px solid",
                                                borderColor: purpose === v ? "var(--app-ink)" : "var(--app-border)",
                                                background: purpose === v ? "var(--app-ink)" : "transparent",
                                                color: purpose === v ? "var(--app-on-ink)" : "var(--app-fg)",
                                                "&:hover": { background: purpose === v ? "var(--app-ink)" : "var(--app-overlay)" },
                                            }}
                                        >
                                            {l}
                                        </Button>
                                    ))}
                                </Stack>
                            </Box>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.8}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography sx={labelSx}>Mobile number</Typography>
                                    <TextField value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputProps={{ inputMode: "numeric", autoComplete: "tel-national" }} size="small" fullWidth sx={field} />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography sx={labelSx}>PAN (personal)</Typography>
                                    <TextField value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCPE1234F" inputProps={{ autoComplete: "off", maxLength: 10 }} size="small" fullWidth sx={field} />
                                </Box>
                            </Stack>
                            <Box>
                                <Typography sx={labelSx}>Address</Typography>
                                <TextField value={street} onChange={(e) => setStreet(e.target.value)} placeholder="House, street, area" inputProps={{ autoComplete: "street-address" }} size="small" fullWidth sx={field} />
                            </Box>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.8}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography sx={labelSx}>City</Typography>
                                    <TextField value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kolkata" inputProps={{ autoComplete: "address-level2" }} size="small" fullWidth sx={field} />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography sx={labelSx}>State</Typography>
                                    <TextField value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="West Bengal" inputProps={{ autoComplete: "address-level1" }} size="small" fullWidth sx={field} />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography sx={labelSx}>PIN code</Typography>
                                    <TextField value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="700001" inputProps={{ inputMode: "numeric", autoComplete: "postal-code", maxLength: 6 }} size="small" fullWidth sx={field} />
                                </Box>
                            </Stack>
                        </>
                    )}
                    <Box>
                        <Typography sx={labelSx}>Account holder name (as on PAN)</Typography>
                        <TextField value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Acme Pvt Ltd" size="small" fullWidth sx={field} />
                    </Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.8}>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={labelSx}>Account number</Typography>
                            <TextField value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={connected ? `••••${account.bank_last4}` : "0000000000"} size="small" fullWidth sx={field} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={labelSx}>IFSC</Typography>
                            <TextField value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" size="small" fullWidth sx={field} />
                        </Box>
                    </Stack>
                </Stack>
                {createError && (
                    <Box sx={{ mt: 1.8, px: 1.6, py: 1.2, borderRadius: "10px", background: "color-mix(in srgb, var(--app-warn) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--app-warn) 30%, transparent)" }}>
                        <Typography sx={{ color: "var(--app-warn)", fontSize: "0.82rem" }}>
                            Razorpay couldn't accept these details yet: {createError}
                        </Typography>
                    </Box>
                )}
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
                    <Button
                        onClick={save}
                        disabled={busy}
                        sx={{ textTransform: "none", fontWeight: 600, color: "var(--app-on-ink)", px: 2.6, py: 0.9, borderRadius: "999px", background: "var(--app-ink)", "&:hover": { background: "var(--app-ink)", opacity: 0.86 }, "&.Mui-disabled": { opacity: 0.5, color: "var(--app-on-ink)" } }}
                    >
                        {busy ? "Saving…" : connected ? "Update" : "Connect bank"}
                    </Button>
                    {connected && (
                        <Button onClick={() => setConfirmDisconnect(true)} disabled={busy} sx={{ textTransform: "none", fontWeight: 600, color: "color-mix(in srgb, var(--app-danger) 85%, transparent)", border: "1px solid color-mix(in srgb, var(--app-danger) 25%, transparent)", borderRadius: "999px", px: 2 }}>
                            Pause payouts
                        </Button>
                    )}
                    {saved && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                            <CheckCircleIcon sx={{ fontSize: 16, color: "var(--app-success)" }} />
                            <Typography sx={{ color: "var(--app-success)", fontSize: "0.82rem" }}>Saved</Typography>
                        </Stack>
                    )}
                    {err && <Typography sx={{ color: "var(--app-danger)", fontSize: "0.82rem" }}>{err}</Typography>}
                </Stack>
                <PolicyLinks trust="payouts" lead="By connecting payouts you agree to the" style={{ marginTop: 14 }} />
            </GlassCard>

            {/* How payouts work (secondary) */}
            <GlassCard sx={{ mt: 2, p: { xs: 2, md: 2.5 } }}>
                <Typography sx={{ ...labelSx, mb: 1.8 }}>How payouts work</Typography>
                <FlowDiagram
                    compact
                    title="How payouts work"
                    steps={[
                        { icon: "phone", title: "Someone pays", body: "A buyer or supporter pays on Elixpo Pay checkout." },
                        { icon: "shield", title: "Razorpay", body: "Processed by Razorpay, an RBI-regulated payment gateway." },
                        { icon: "split", title: "Route split", body: `${sharePct}% to you, ${feePct}% Elixpo platform fee.` },
                        { icon: "bank", title: "Your bank", body: "Razorpay settles your share on its settlement schedule." },
                    ]}
                />
                <Box component="ul" sx={{ m: 0, mt: 2, pl: 2.2, color: "var(--app-fg-muted)", fontSize: "0.8rem", lineHeight: 1.6, "& li + li": { mt: 0.4 } }}>
                    <li>
                        When you connect, we create a Razorpay Route linked account for you. Razorpay
                        runs the KYC checks; payouts switch on once it is verified.
                    </li>
                    <li>
                        Your full account number is sent to Razorpay to create that account and is not
                        stored by Elixpo. We keep only the last 4 digits, the IFSC and the holder name, for display.
                    </li>
                </Box>
            </GlassCard>

            {/* Routable revenue */}
            {routable.length > 0 && (
                <GlassCard sx={{ mt: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "1rem", mb: 1 }}>
                        Collected so far
                    </Typography>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                        {routable.map((r: any) => (
                            <Box key={r.currency}>
                                <Typography sx={{ fontWeight: 800, fontSize: "1.5rem" }}>
                                    {formatMoney(r.total, r.currency)}
                                </Typography>
                                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.78rem" }}>
                                    {r.count} payment{r.count === 1 ? "" : "s"} · {r.currency}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                    <Typography sx={{ color: "var(--app-fg-faint)", fontSize: "0.74rem", mt: 1.4 }}>
                        This is what's flowed through your apps. When Route is live, your share (after
                        the platform fee) lands in your bank automatically on each payment.
                    </Typography>
                </GlassCard>
            )}
              </>
            )}

            <ConfirmDialog
                open={confirmDisconnect}
                destructive
                busy={busy}
                title="Pause payouts?"
                confirmLabel="Pause payouts"
                message={
                    <>
                        While payouts are paused, your fundraisers stop accepting contributions, and
                        product payments <strong>settle into the Elixpo Pay account</strong> instead of
                        your bank until you resume. Payments already made aren't affected. You can
                        resume any time without redoing KYC.
                    </>
                }
                onConfirm={disconnect}
                onClose={() => setConfirmDisconnect(false)}
            />
        </Box>
    );
}
