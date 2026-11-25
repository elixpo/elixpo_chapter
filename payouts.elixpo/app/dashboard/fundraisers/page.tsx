"use client";

export const runtime = "edge";

import AddIcon from "@mui/icons-material/Add";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, GlassCard } from "@/components/dashboard-ui";
import FundraiserStatusChip from "@/components/fundraiser-status";
import FlowDiagram from "@/components/trust/flow-diagram";
import PolicyLinks from "@/components/trust/policy-links";
import FundraiserEditor, { EMPTY_DRAFT, type FundraiserDraft, toPayload } from "@/components/fundraiser-editor";

export default function FundraisersPage() {
    const [rows, setRows] = useState<any[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/dashboard/fundraisers", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : { fundraisers: [] }))
            .then((d: any) => setRows(d.fundraisers ?? []))
            .catch(() => setRows([]));
    }, []);

    const create = async (d: FundraiserDraft) => {
        setBusy(true);
        setErr(null);
        const r = await fetch("/api/dashboard/fundraisers", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toPayload(d)),
        });
        const j: any = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setErr(j.error_description || "Couldn't create the fundraiser.");
        window.location.assign(`/dashboard/fundraisers/${j.fundraiser.id}`);
    };


    return (
        <Box>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "flex-end" }} spacing={2} sx={{ mb: 3 }}>
                <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>Fundraisers</Typography>
                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.92rem" }}>
                        A public page with a goal where anyone can chip in — share it as a link or a QR code.
                    </Typography>
                </Box>
                {!creating && (
                    <Button
                        onClick={() => setCreating(true)}
                        startIcon={<AddIcon />}
                        sx={{ textTransform: "none", fontWeight: 700, px: 2.4, borderRadius: "999px", color: "var(--app-on-ink)", background: "var(--app-ink)", "&:hover": { background: "var(--app-ink)", opacity: 0.86 } }}
                    >
                        New fundraiser
                    </Button>
                )}
            </Stack>

            {creating && (
                <GlassCard sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", mb: 2 }}>New fundraiser</Typography>
                    {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
                    <FundraiserEditor initial={EMPTY_DRAFT} submitLabel="Create draft" busy={busy} onSubmit={create} />
                </GlassCard>
            )}

            {rows === null ? (
                <Box sx={{ py: 6, textAlign: "center" }}>
                    <CircularProgress size={26} />
                </Box>
            ) : rows.length === 0 && !creating ? (
                <GlassCard sx={{ textAlign: "center", py: 6 }}>
                    <Typography sx={{ fontWeight: 700, mb: 1 }}>No fundraisers yet</Typography>
                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.9rem" }}>
                        Create one, connect payouts, publish — then share the QR code.
                    </Typography>
                </GlassCard>
            ) : (
                <Stack spacing={1.5}>
                    {[...rows]
                        .sort((a, b) => Number(a.status === "deleted") - Number(b.status === "deleted"))
                        .map((f) => {
                        const pct = f.goal_amount ? Math.min(100, Math.round((f.raised / f.goal_amount) * 100)) : 0;
                        return (
                            <GlassCard key={f.id} sx={{ p: { xs: 2, md: 2.5 }, opacity: f.status === "deleted" ? 0.6 : 1 }}>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.4 }}>
                                            <Typography component={Link} href={`/dashboard/fundraisers/${f.id}`} sx={{ fontWeight: 700, color: "var(--app-fg)", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
                                                {f.title}
                                            </Typography>
                                            <FundraiserStatusChip status={f.status} />
                                        </Stack>
                                        <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem", fontFamily: "var(--font-geist-mono)" }}>
                                            /f/{f.slug} · {f.status}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ minWidth: { sm: 240 } }}>
                                        <Typography sx={{ fontWeight: 700 }}>
                                            {formatMoney(f.raised, f.goal_currency)}{" "}
                                            <Box component="span" sx={{ color: "var(--app-fg-muted)", fontWeight: 400, fontSize: "0.85rem" }}>
                                                of {formatMoney(f.goal_amount, f.goal_currency)} · {f.contributors} contributors
                                            </Box>
                                        </Typography>
                                        <Box sx={{ mt: 0.8, height: 6, borderRadius: 999, background: "var(--app-surface-2)", overflow: "hidden" }}>
                                            <Box sx={{ width: `${pct}%`, height: "100%", background: "var(--app-ink)" }} />
                                        </Box>
                                    </Box>
                                </Stack>
                            </GlassCard>
                        );
                    })}
                </Stack>
            )}

            {/* How fundraisers work (secondary) */}
            <GlassCard sx={{ mt: 3, p: { xs: 2, md: 2.5 } }}>
                <Typography
                    sx={{
                        fontSize: "0.7rem",
                        color: "var(--app-fg-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontFamily: "var(--font-geist-mono)",
                        mb: 1.8,
                    }}
                >
                    How fundraisers work
                </Typography>
                <FlowDiagram
                    compact
                    title="How fundraisers work"
                    steps={[
                        { icon: "heart", title: "Create", body: "Write your page as a draft." },
                        { icon: "bank", title: "Connect payouts", body: "Required before you can publish." },
                        { icon: "phone", title: "Publish & share", body: "Share the link or QR. Supporters pay by UPI or card and get an email receipt." },
                        { icon: "check", title: "Money reaches your bank", body: "Via Razorpay Route, minus Elixpo's 5% all-in fee." },
                    ]}
                />
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.8rem", lineHeight: 1.6, mt: 2 }}>
                    Contributions are donations: don&rsquo;t promise goods in return, and say honestly how
                    the money will be used. Contributions are not tax-deductible. Anyone can report a page,
                    and Elixpo can hold or unpublish it.
                </Typography>
                <PolicyLinks trust="contributing" lead="Fundraisers are covered by the" style={{ marginTop: 10 }} />
            </GlassCard>
        </Box>
    );
}
