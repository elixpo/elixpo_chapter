"use client";

export const runtime = "edge";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import IosShareIcon from "@mui/icons-material/IosShare";
import LaunchIcon from "@mui/icons-material/Launch";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { Alert, Box, Button, CircularProgress, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { fmtDate, formatMoney, GlassCard } from "@/components/dashboard-ui";
import FundraiserEditor, { type FundraiserDraft, toDraft, toPayload } from "@/components/fundraiser-editor";
import FundraiserQr from "@/components/fundraiser-qr";
import FundraiserShareDialog from "@/components/fundraiser-share";
import FundraiserStatusChip from "@/components/fundraiser-status";

const ink = {
    textTransform: "none",
    fontWeight: 700,
    borderRadius: "999px",
    px: 2.2,
    color: "var(--app-on-ink)",
    background: "var(--app-ink)",
    "&:hover": { background: "var(--app-ink)", opacity: 0.86 },
    "&.Mui-disabled": { color: "var(--app-on-ink)", opacity: 0.45 },
};
const ghost = {
    textTransform: "none",
    fontWeight: 700,
    borderRadius: "999px",
    px: 2,
    color: "var(--app-fg)",
    border: "1px solid var(--app-border)",
    "&:hover": { borderColor: "var(--app-fg)" },
};
const label = {
    color: "var(--app-fg-muted)",
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
};
const sectionTitle = { fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.02em" };

const SUBTITLE: Record<string, string> = {
    live: "Live — accepting contributions.",
    draft: "Draft — only you can see it. Publish when you're ready.",
    closed: "Closed — the page stays up as a record. You can re-open it.",
    held: "Held by Elixpo moderation.",
    deleted: "Deleted — anyone who opens the link sees a “no longer taking contributions” notice.",
};

export default function FundraiserDetail() {
    const id = String(useParams().id);
    const router = useRouter();
    const [f, setF] = useState<any>(null);
    const [missing, setMissing] = useState(false);
    const [rows, setRows] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
    const [editorKey, setEditorKey] = useState(0);
    const [origin, setOrigin] = useState("https://payouts.elixpo.com");

    const load = useCallback(async () => {
        const [a, b] = await Promise.all([
            fetch(`/api/dashboard/fundraisers/${id}`, { credentials: "include" }),
            fetch(`/api/dashboard/fundraisers/${id}/contributions`, { credentials: "include" }),
        ]);
        if (a.status === 404) return setMissing(true);
        if (a.ok) setF(((await a.json()) as any).fundraiser);
        if (b.ok) setRows(((await b.json()) as any).contributions ?? []);
    }, [id]);

    useEffect(() => {
        setOrigin(window.location.origin);
        load();
        // Contributions land live — refresh while the page is open.
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [load]);

    const patch = async (body: Record<string, unknown>, ok: string) => {
        setBusy(true);
        setMsg(null);
        const r = await fetch(`/api/dashboard/fundraisers/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const j: any = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setMsg({ ok: false, text: j.error_description || "Something went wrong." });
        setF(j.fundraiser);
        setEditorKey((k) => k + 1);
        setMsg({ ok: true, text: ok });
    };

    const remove = async () => {
        setBusy(true);
        const r = await fetch(`/api/dashboard/fundraisers/${id}`, { method: "DELETE", credentials: "include" });
        const j: any = await r.json().catch(() => ({}));
        setBusy(false);
        setConfirm(null);
        if (!r.ok) return setMsg({ ok: false, text: j.error_description || "Couldn't delete the fundraiser." });
        if (j.deleted === "hard") return router.push("/dashboard/fundraisers");
        setMsg({ ok: true, text: "Deleted. The link now shows a closed notice; your contribution records are kept below." });
        load();
    };

    if (missing) {
        return (
            <GlassCard sx={{ textAlign: "center", py: 6 }}>
                <Typography sx={{ fontWeight: 700 }}>Fundraiser not found</Typography>
                <Button component={Link} href="/dashboard/fundraisers" sx={{ ...ghost, mt: 2 }}>
                    Back to fundraisers
                </Button>
            </GlassCard>
        );
    }
    if (!f) {
        return (
            <Box sx={{ py: 8, textAlign: "center" }}>
                <CircularProgress size={26} />
            </Box>
        );
    }

    const url = `${origin}/f/${f.slug}`;
    const pct = f.goal_amount ? Math.min(100, Math.round((f.raised / f.goal_amount) * 100)) : 0;
    const deleted = f.status === "deleted";
    const canPublish = (f.status === "draft" || f.status === "closed") && f.payout_ready && !f.ended;
    const shareable = f.status === "live" || f.status === "closed";
    const shareInfo = {
        url,
        title: f.title,
        raised: f.raised,
        goal: f.goal_amount,
        contributors: f.contributors,
        endsAt: f.ends_at,
    };
    const quickText = `I'm raising ${formatMoney(f.goal_amount, "INR")} for ${f.title}. Every bit helps — chip in here: ${url}`;

    return (
        <Box>
            <Button component={Link} href="/dashboard/fundraisers" startIcon={<ArrowBackIcon />} sx={{ ...ghost, border: 0, px: 0, mb: 1.5 }}>
                Fundraisers
            </Button>

            {/* ── Header ───────────────────────────────────────────────── */}
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "flex-start" }} spacing={2} sx={{ mb: 2.5 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.6rem", md: "2rem" }, letterSpacing: "-0.035em", lineHeight: 1.1, overflowWrap: "anywhere" }}>
                            {f.title}
                        </Typography>
                        <FundraiserStatusChip status={f.status} />
                    </Stack>
                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.9rem", mt: 0.6 }}>{SUBTITLE[f.status] ?? ""}</Typography>
                </Box>
                {!deleted && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                        <Button component="a" href={`/f/${f.slug}`} target="_blank" startIcon={<LaunchIcon />} sx={ghost}>
                            {f.status === "draft" ? "Preview" : "View page"}
                        </Button>
                        {shareable && (
                            <Button onClick={() => setShareOpen(true)} startIcon={<IosShareIcon />} sx={f.status === "live" ? ink : ghost}>
                                Share
                            </Button>
                        )}
                        {f.status === "live" ? (
                            <Button
                                onClick={() => setConfirm("close")}
                                disabled={busy}
                                sx={{
                                    ...ghost,
                                    color: "#fff",
                                    background: "var(--app-danger)",
                                    borderColor: "var(--app-danger)",
                                    "&:hover": { background: "var(--app-danger)", opacity: 0.88, borderColor: "var(--app-danger)" },
                                }}
                            >
                                Close fundraiser
                            </Button>
                        ) : f.status !== "held" ? (
                            <Button onClick={() => patch({ action: "publish" }, "Published — your page is live.")} disabled={busy || !canPublish} sx={ink}>
                                {f.status === "closed" ? "Re-open" : "Publish"}
                            </Button>
                        ) : null}
                        <IconButton aria-label="More actions" onClick={(e) => setMenuEl(e.currentTarget)} sx={{ border: "1px solid var(--app-border)" }}>
                            <MoreHorizIcon />
                        </IconButton>
                        <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
                            <MenuItem
                                onClick={() => {
                                    setMenuEl(null);
                                    navigator.clipboard?.writeText(url).then(() => setMsg({ ok: true, text: "Link copied." }));
                                }}
                            >
                                <ContentCopyIcon fontSize="small" sx={{ mr: 1.2 }} /> Copy link
                            </MenuItem>
                            <MenuItem
                                onClick={() => {
                                    setMenuEl(null);
                                    setConfirm("delete");
                                }}
                                sx={{ color: "var(--app-danger)" }}
                            >
                                <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.2 }} /> Delete fundraiser…
                            </MenuItem>
                        </Menu>
                    </Stack>
                )}
            </Stack>

            {f.status === "held" && <Alert severity="warning" sx={{ mb: 2 }}>{f.moderation_note || "This page is held for review."} Contact hello@elixpo.com to restore it.</Alert>}
            {f.status === "draft" && f.moderation_note && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {f.moderation_note} You can edit this page, but it can't be published again until Elixpo reviews it. Write
                    to hello@elixpo.com.
                </Alert>
            )}
            {!deleted && !f.payout_ready && f.status !== "held" && (
                <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} href="/dashboard/payouts" sx={{ textTransform: "none", fontWeight: 700 }}>Connect payouts</Button>}>
                    {f.payout_reason} A fundraiser can go public only once contributions can reach you.
                </Alert>
            )}
            {!deleted && f.ended && f.status !== "held" && (
                <Alert severity="info" sx={{ mb: 2 }}>The end date has passed, so the page no longer accepts contributions. Move the date forward to re-open it.</Alert>
            )}
            {msg && (
                <Alert severity={msg.ok ? "success" : "error"} sx={{ mb: 2 }} onClose={() => setMsg(null)}>
                    {msg.text}
                </Alert>
            )}

            {/* ── Progress ─────────────────────────────────────────────── */}
            <GlassCard sx={{ mb: 2, p: { xs: 2.5, md: 3.5 } }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "flex-end" }} spacing={1}>
                    <Box>
                        <Typography sx={label}>Raised</Typography>
                        <Typography sx={{ fontSize: { xs: "2.4rem", md: "3.2rem" }, fontWeight: 510, letterSpacing: "-0.06em", lineHeight: 1 }}>
                            {formatMoney(f.raised, f.goal_currency)}
                            <Box component="span" sx={{ fontSize: "1rem", fontWeight: 500, letterSpacing: 0, color: "var(--app-fg-muted)", ml: 1 }}>
                                of {formatMoney(f.goal_amount, f.goal_currency)}
                            </Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={3}>
                        <Box>
                            <Typography sx={label}>Funded</Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: "1.4rem" }}>{pct}%</Typography>
                        </Box>
                        <Box>
                            <Typography sx={label}>Supporters</Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: "1.4rem" }}>{f.contributors}</Typography>
                        </Box>
                        <Box>
                            <Typography sx={label}>Ends</Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: "1.4rem" }}>{f.ends_at ? fmtDate(f.ends_at).split(",")[0] : "—"}</Typography>
                        </Box>
                    </Stack>
                </Stack>
                <Box sx={{ mt: 2, height: 12, borderRadius: 999, background: "var(--app-surface-2)", overflow: "hidden" }}>
                    <Box sx={{ width: `${Math.max(pct, f.raised > 0 ? 2 : 0)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--app-success), var(--app-ink))", transition: "width .8s ease" }} />
                </Box>
            </GlassCard>

            {/* ── Contributions + quick share ──────────────────────────── */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: deleted ? "1fr" : "minmax(0, 1.6fr) minmax(300px, 1fr)" }, gap: 2, mb: 2, alignItems: "start" }}>
                <GlassCard>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                        <Typography sx={sectionTitle}>Contributions</Typography>
                        <Button component="a" href={`/api/dashboard/fundraisers/${id}/contributions?format=csv`} startIcon={<DownloadIcon />} disabled={!rows.length} sx={ghost}>
                            Export CSV
                        </Button>
                    </Stack>
                    {rows.length === 0 ? (
                        <Box sx={{ py: 4, textAlign: "center" }}>
                            <Typography sx={{ fontWeight: 700 }}>No contributions yet</Typography>
                            <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.88rem", mt: 0.5 }}>
                                {shareable ? "Share the link — contributions appear here within seconds." : "Publish the fundraiser to start receiving contributions."}
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ borderTop: "1px solid var(--app-border)" }}>
                            {rows.map((c) => (
                                <Stack key={c.id} direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 1.4, borderBottom: "1px solid var(--app-border)" }}>
                                    <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--app-art-2)", color: "#142018", fontWeight: 800 }}>
                                        {(c.name || "A").charAt(0).toUpperCase()}
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700, fontSize: "0.92rem" }}>
                                            {c.name}
                                            {!c.public && c.name !== "Anonymous" && (
                                                <Box component="span" sx={{ ml: 1, color: "var(--app-fg-faint)", fontSize: "0.74rem", fontWeight: 500 }}>
                                                    hidden on page
                                                </Box>
                                            )}
                                        </Typography>
                                        {c.message && <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.86rem", overflowWrap: "anywhere" }}>“{c.message}”</Typography>}
                                        <Typography sx={{ color: "var(--app-fg-faint)", fontSize: "0.76rem", mt: 0.3 }}>{fmtDate(c.paid_at)}</Typography>
                                    </Box>
                                    <Box sx={{ fontWeight: 800, flexShrink: 0 }}>{formatMoney(c.amount, c.currency)}</Box>
                                </Stack>
                            ))}
                        </Box>
                    )}
                </GlassCard>

                {!deleted && (
                    <GlassCard>
                        <Typography sx={sectionTitle}>Share</Typography>
                        <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.86rem", mt: 0.4, mb: 1.6 }}>
                            {shareable ? "Send the link with a ready-made message." : "Publish first — then share the link."}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, pl: 1.4, borderRadius: "12px", background: "var(--app-surface-2)", mb: 1.4 }}>
                            <Box sx={{ flex: 1, minWidth: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</Box>
                            <IconButton size="small" aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(url).then(() => setMsg({ ok: true, text: "Link copied." }))}>
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                        <Stack spacing={1}>
                            <Button onClick={() => setShareOpen(true)} disabled={!shareable} startIcon={<IosShareIcon />} sx={{ ...ink, justifyContent: "center" }}>
                                Share with a message
                            </Button>
                            <Button component="a" href={`https://wa.me/?text=${encodeURIComponent(quickText)}`} target="_blank" rel="noopener noreferrer" disabled={!shareable} startIcon={<WhatsAppIcon />} sx={{ ...ghost, justifyContent: "center" }}>
                                Send on WhatsApp
                            </Button>
                        </Stack>
                    </GlassCard>
                )}
            </Box>

            {!deleted && (
                <>
                    {/* ── QR studio ───────────────────────────────────── */}
                    <GlassCard sx={{ mb: 2 }}>
                        <Typography sx={sectionTitle}>QR code</Typography>
                        <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.86rem", mt: 0.4, mb: 2.2 }}>
                            Style it, add a logo, and print it on the badge box, a poster or a slide — it opens the page straight on a phone.
                        </Typography>
                        <FundraiserQr url={url} title={f.title} slug={f.slug} />
                    </GlassCard>

                    {/* ── Edit ────────────────────────────────────────── */}
                    <GlassCard sx={{ mb: 2 }}>
                        <Typography sx={{ ...sectionTitle, mb: 2 }}>Edit</Typography>
                        <FundraiserEditor
                            key={editorKey}
                            initial={toDraft(f)}
                            submitLabel="Save changes"
                            busy={busy}
                            slugLocked={!!f.published_at}
                            onSubmit={(d: FundraiserDraft) => {
                                const p: Record<string, unknown> = toPayload(d);
                                if (f.published_at) delete p.slug;
                                patch(p, "Saved.");
                            }}
                        />
                    </GlassCard>

                    {/* ── Danger zone ─────────────────────────────────── */}
                    <GlassCard sx={{ borderColor: "color-mix(in srgb, var(--app-danger) 35%, transparent)" }}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
                            <Box>
                                <Typography sx={{ ...sectionTitle, color: "var(--app-danger)" }}>Delete fundraiser</Typography>
                                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.86rem", mt: 0.4, maxWidth: 620 }}>
                                    {f.published_at
                                        ? "Stops contributions immediately. Anyone who scans the QR or opens the link sees a thank-you notice that it's closed. Contribution records are kept for you."
                                        : "This draft was never published, so it's removed completely and the link becomes available again."}
                                </Typography>
                            </Box>
                            <Button onClick={() => setConfirm("delete")} startIcon={<DeleteOutlineIcon />} sx={{ ...ghost, color: "var(--app-danger)", borderColor: "color-mix(in srgb, var(--app-danger) 45%, transparent)", flexShrink: 0 }}>
                                Delete…
                            </Button>
                        </Stack>
                    </GlassCard>
                </>
            )}

            <FundraiserShareDialog open={shareOpen} onClose={() => setShareOpen(false)} info={shareInfo} />
            <ConfirmDialog
                open={confirm === "close"}
                title="Close this fundraiser?"
                message="It stops accepting contributions now. The page stays up as a record with the final total, and you can re-open it later."
                confirmLabel="Close fundraiser"
                busy={busy}
                onConfirm={async () => {
                    await patch({ action: "close" }, "Closed. The page stays up as a record.");
                    setConfirm(null);
                }}
                onClose={() => setConfirm(null)}
            />
            <ConfirmDialog
                open={confirm === "delete"}
                destructive
                title={f.published_at ? "Delete this fundraiser?" : "Delete this draft?"}
                message={
                    f.published_at ? (
                        <>
                            <strong>{f.title}</strong> stops taking contributions immediately. People who scan the QR or open
                            the link will see that it has closed, with a thank-you for their interest. This can't be undone;
                            your contribution records stay available here.
                        </>
                    ) : (
                        <>
                            <strong>{f.title}</strong> was never published, so it will be removed completely. This can't be
                            undone.
                        </>
                    )
                }
                confirmLabel={f.published_at ? "Delete fundraiser" : "Delete draft"}
                busy={busy}
                onConfirm={remove}
                onClose={() => setConfirm(null)}
            />
        </Box>
    );
}
