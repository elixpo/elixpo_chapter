"use client";

export const runtime = "edge";

import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { formatMoney, GlassCard, StatusChip } from "@/components/dashboard-ui";

/** Elixpo admin: review reported fundraisers; hold, unpublish or restore. */
export default function ModerationPage() {
    const [data, setData] = useState<{ fundraisers: any[]; reports: any[] } | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/dashboard/moderation", { credentials: "include" });
        if (r.status === 403) return setForbidden(true);
        if (r.ok) setData((await r.json()) as any);
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const act = async (fundraiser_id: string, action: string) => {
        setBusy(`${fundraiser_id}:${action}`);
        await fetch("/api/dashboard/moderation", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fundraiser_id, action, note: notes[fundraiser_id] || "" }),
        });
        setBusy(null);
        load();
    };

    if (forbidden) return <Alert severity="warning">Moderation is only available to Elixpo admins.</Alert>;
    if (!data) {
        return (
            <Box sx={{ py: 8, textAlign: "center" }}>
                <CircularProgress size={26} />
            </Box>
        );
    }

    const btn = { textTransform: "none", fontWeight: 700, borderRadius: "999px", px: 1.8, border: "1px solid var(--app-border)", color: "var(--app-fg)" };

    return (
        <Box>
            <Typography sx={{ fontWeight: 800, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>Moderation</Typography>
            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.92rem", mb: 3 }}>
                Reported pages first. Hold stops payments and shows “under review”; unpublish sends it back to the creator as a draft.
            </Typography>
            <Stack spacing={1.5}>
                {data.fundraisers.length === 0 && (
                    <GlassCard sx={{ textAlign: "center", py: 5 }}>
                        <Typography sx={{ color: "var(--app-fg-muted)" }}>No published fundraisers yet.</Typography>
                    </GlassCard>
                )}
                {data.fundraisers.map((f) => {
                    const reports = data.reports.filter((r) => r.fundraiser_id === f.id);
                    return (
                        <GlassCard key={f.id}>
                            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography component="a" href={`/f/${f.slug}`} target="_blank" sx={{ fontWeight: 700, color: "var(--app-fg)" }}>
                                            {f.title}
                                        </Typography>
                                        <StatusChip status={f.status === "live" ? "active" : f.status === "held" ? "failed" : f.status === "closed" ? "expired" : "open"} />
                                        {f.open_reports > 0 && <StatusChip status="failed" />}
                                    </Stack>
                                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem" }}>
                                        by {f.owner_name || "—"} · raised {formatMoney(f.raised, "INR")} · {f.open_reports} open report(s)
                                    </Typography>
                                    {f.moderation_note && <Typography sx={{ fontSize: "0.82rem", mt: 0.5 }}>Note: {f.moderation_note}</Typography>}
                                    {reports.map((r) => (
                                        <Alert key={r.id} severity="warning" sx={{ mt: 1 }}>
                                            <strong>{r.reason}</strong>
                                            {r.details ? ` — ${r.details}` : ""}
                                            {r.reporter_email ? ` (${r.reporter_email})` : ""}
                                        </Alert>
                                    ))}
                                </Box>
                                <Stack spacing={1} sx={{ minWidth: { md: 260 } }}>
                                    <TextField size="small" placeholder="Note to the creator (optional)" value={notes[f.id] || ""}
                                        onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} />
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        {f.status !== "held" && (
                                            <Button sx={{ ...btn, color: "var(--app-danger)" }} disabled={!!busy} onClick={() => act(f.id, "hold")}>
                                                Hold
                                            </Button>
                                        )}
                                        {f.status !== "draft" && (
                                            <Button sx={btn} disabled={!!busy} onClick={() => act(f.id, "unpublish")}>
                                                Unpublish
                                            </Button>
                                        )}
                                        {(f.status === "held" || (f.status === "draft" && f.moderation_note)) && (
                                            <Button sx={btn} disabled={!!busy} onClick={() => act(f.id, "restore")}>
                                                Restore
                                            </Button>
                                        )}
                                        {f.open_reports > 0 && (
                                            <Button sx={btn} disabled={!!busy} onClick={() => act(f.id, "resolve")}>
                                                Dismiss reports
                                            </Button>
                                        )}
                                    </Stack>
                                </Stack>
                            </Stack>
                        </GlassCard>
                    );
                })}
            </Stack>
        </Box>
    );
}
