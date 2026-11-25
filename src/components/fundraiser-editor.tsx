"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { Box, Button, CircularProgress, FormControlLabel, IconButton, InputAdornment, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import PolicyLinks from "@/components/trust/policy-links";

type Cur = "INR" | "USD";

export interface FundraiserDraft {
    title: string;
    slug: string;
    body_md: string;
    /** Cover images (slideshow), first is also the social preview. */
    covers: string[];
    cover_autoplay: boolean;
    /** Public name shown instead of the account name. */
    display_name: string;
    link_url: string;
    /** Digits only, whole rupees. */
    goal_rupees: string;
    /** Major units (₹ / $), ascending. */
    presets_inr: number[];
    presets_usd: number[];
    thank_you_message: string;
    ends_at: string; // yyyy-mm-dd
}

export const EMPTY_DRAFT: FundraiserDraft = {
    title: "",
    slug: "",
    body_md: "",
    covers: [],
    cover_autoplay: true,
    display_name: "",
    link_url: "",
    goal_rupees: "",
    presets_inr: [100, 250, 500, 1000],
    presets_usd: [5, 10, 25, 50],
    thank_you_message: "",
    ends_at: "",
};

/** Mirrors the server's LIMITS (major units). */
const CUR: Record<Cur, { sym: string; label: string; min: number; max: number; locale: string; tint: string; ink: string }> = {
    INR: { sym: "₹", label: "INR", min: 10, max: 200000, locale: "en-IN", tint: "color-mix(in srgb, var(--app-success) 12%, transparent)", ink: "var(--app-success)" },
    USD: { sym: "$", label: "USD", min: 1, max: 2500, locale: "en-US", tint: "color-mix(in srgb, var(--app-accent) 12%, transparent)", ink: "var(--app-accent)" },
};
const GOAL_MIN = 100;
const GOAL_MAX = 10_000_000; // ₹1,00,00,000
const MAX_PRESETS = 6;
const MAX_COVERS = 6;

const fmt = (n: number, cur: Cur) =>
    `${CUR[cur].sym}${n.toLocaleString(CUR[cur].locale, { maximumFractionDigits: 2 })}`;

/** Owner-view JSON → editable draft. */
export function toDraft(f: any): FundraiserDraft {
    const major = (arr: number[] | undefined) => (arr ?? []).map((v) => v / 100);
    return {
        title: f.title ?? "",
        slug: f.slug ?? "",
        body_md: f.body_md ?? "",
        covers: Array.isArray(f.covers) ? f.covers : f.cover_url ? [f.cover_url] : [],
        cover_autoplay: f.cover_autoplay !== false,
        display_name: f.display_name ?? "",
        link_url: f.link_url ?? "",
        goal_rupees: f.goal_amount ? String(Math.round(f.goal_amount / 100)) : "",
        presets_inr: major(f.presets?.INR),
        presets_usd: major(f.presets?.USD),
        thank_you_message: f.thank_you_message ?? "",
        ends_at: f.ends_at ? String(f.ends_at).slice(0, 10) : "",
    };
}

const cleanUrl = (u: string) => (u.trim() === "https://" ? "" : u.trim());

/** Draft → API body (minor units). */
export function toPayload(d: FundraiserDraft) {
    return {
        title: d.title,
        slug: d.slug || undefined,
        body_md: d.body_md,
        cover_urls: d.covers.map(cleanUrl).filter(Boolean),
        cover_autoplay: d.cover_autoplay,
        display_name: d.display_name.trim(),
        link_url: cleanUrl(d.link_url),
        goal_amount: Number(d.goal_rupees || 0) * 100,
        presets: {
            INR: d.presets_inr.map((v) => Math.round(v * 100)),
            USD: d.presets_usd.map((v) => Math.round(v * 100)),
        },
        thank_you_message: d.thank_you_message,
        // End of the chosen day, IST, so "ends on the 30th" includes the 30th.
        ends_at: d.ends_at ? `${d.ends_at}T23:59:59+05:30` : "",
    };
}

/** Client mirror of the server's publicHttpsUrl (server re-checks). */
function urlError(raw: string, what: string): string | null {
    const v = cleanUrl(raw);
    if (!v) return null;
    if (/^http:\/\//i.test(v)) return `${what} must use https://, not http://.`;
    let u: URL;
    try {
        u = new URL(v);
    } catch {
        return `${what} isn't a valid link.`;
    }
    if (u.protocol !== "https:") return `${what} must start with https://.`;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) {
        return `${what} must be a public website.`;
    }
    return null;
}

const field = {
    "& .MuiOutlinedInput-root": { background: "var(--app-bg)", borderRadius: "12px" },
};

/** Currency badge used on the goal and preset fields. */
function CurrencyBadge({ cur }: { cur: Cur }) {
    return (
        <Box
            component="span"
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.3,
                borderRadius: "999px",
                background: CUR[cur].tint,
                color: CUR[cur].ink,
                fontWeight: 800,
                fontSize: "0.8rem",
                whiteSpace: "nowrap",
            }}
        >
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>{CUR[cur].sym}</span>
            <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.66rem", letterSpacing: "0.1em" }}>
                {CUR[cur].label}
            </span>
        </Box>
    );
}

/**
 * Preset amounts as chips. Type an amount and press Enter / comma / Tab (or
 * paste "100, 250, 500"); Backspace on an empty input removes the last chip.
 */
function AmountChips({ cur, values, onChange }: { cur: Cur; values: number[]; onChange: (v: number[]) => void }) {
    const c = CUR[cur];
    const [text, setText] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const commit = (raw: string) => {
        const parts = raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
        if (!parts.length) return;
        let next = [...values];
        for (const p of parts) {
            const n = Number(p.replace(/[^\d.]/g, ""));
            if (!Number.isFinite(n) || n <= 0) return setErr(`"${p}" isn't an amount.`);
            const v = cur === "INR" ? Math.round(n) : Math.round(n * 100) / 100;
            if (v < c.min || v > c.max) return setErr(`Each ${c.sym} preset must be between ${fmt(c.min, cur)} and ${fmt(c.max, cur)}.`);
            if (!next.includes(v)) next.push(v);
        }
        next = next.sort((a, b) => a - b);
        if (next.length > MAX_PRESETS) return setErr(`Up to ${MAX_PRESETS} ${c.sym} presets.`);
        setErr(null);
        setText("");
        onChange(next);
    };

    return (
        <Box>
            <Box
                onClick={() => inputRef.current?.focus()}
                sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 0.75,
                    minHeight: 54,
                    px: 1.2,
                    py: 0.9,
                    borderRadius: "12px",
                    border: `1px solid ${err ? "var(--app-danger)" : "var(--app-border)"}`,
                    background: "var(--app-bg)",
                    cursor: "text",
                    "&:focus-within": { borderColor: err ? "var(--app-danger)" : c.ink, boxShadow: `0 0 0 1px ${err ? "var(--app-danger)" : c.ink}` },
                }}
            >
                <CurrencyBadge cur={cur} />
                {values.map((v) => (
                    <Box
                        key={v}
                        component="span"
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.3,
                            pl: 1.1,
                            pr: 0.4,
                            py: 0.35,
                            borderRadius: "999px",
                            border: `1px solid color-mix(in srgb, ${c.ink} 35%, transparent)`,
                            color: "var(--app-fg)",
                            fontWeight: 700,
                            fontSize: "0.88rem",
                        }}
                    >
                        <span style={{ color: c.ink }}>{c.sym}</span>
                        {v.toLocaleString(c.locale, { maximumFractionDigits: 2 })}
                        <Box
                            component="button"
                            type="button"
                            aria-label={`Remove ${fmt(v, cur)}`}
                            onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                onChange(values.filter((x) => x !== v));
                            }}
                            sx={{ display: "grid", placeItems: "center", width: 20, height: 20, ml: 0.2, p: 0, border: 0, borderRadius: "50%", background: "transparent", color: "var(--app-fg-muted)", cursor: "pointer", "&:hover": { background: "var(--app-overlay)", color: "var(--app-fg)" } }}
                        >
                            <CloseIcon sx={{ fontSize: 14 }} />
                        </Box>
                    </Box>
                ))}
                <Box
                    component="input"
                    ref={inputRef}
                    value={text}
                    inputMode="decimal"
                    aria-label={`Add a ${c.label} preset amount`}
                    placeholder={values.length >= MAX_PRESETS ? "" : values.length ? "Add…" : `e.g. ${cur === "INR" ? "100, 250, 500" : "5, 10, 25"}`}
                    disabled={values.length >= MAX_PRESETS}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const v = e.target.value.replace(/[^\d.,\s]/g, "");
                        if (/[,\s]$/.test(v)) commit(v);
                        else setText(v);
                        setErr(null);
                    }}
                    onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                        e.preventDefault();
                        commit(e.clipboardData.getData("text"));
                    }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if ((e.key === "Enter" || e.key === "Tab") && text.trim()) {
                            e.preventDefault();
                            commit(text);
                        } else if (e.key === "Backspace" && !text && values.length) {
                            onChange(values.slice(0, -1));
                        }
                    }}
                    onBlur={() => text.trim() && commit(text)}
                    sx={{ flex: 1, minWidth: 90, border: 0, outline: 0, background: "transparent", color: "var(--app-fg)", font: "inherit", fontSize: "0.95rem", py: 0.4 }}
                />
            </Box>
            <Typography sx={{ mt: 0.6, fontSize: "0.75rem", color: err ? "var(--app-danger)" : "var(--app-fg-muted)" }}>
                {err ??
                    (cur === "INR"
                        ? `Press Enter or comma to add. Up to ${MAX_PRESETS}, ${fmt(c.min, cur)}–${fmt(c.max, cur)}.`
                        : `Shown to visitors outside India; charged in INR at the live rate. ${fmt(c.min, cur)}–${fmt(c.max, cur)}.`)}
            </Typography>
        </Box>
    );
}

type CoverState = { status: "empty" | "invalid" | "checking" | "ok" | "error"; message?: string };

/** URL field that prefills https:// on focus and adds it on blur if missing. */
function HttpsField({ label, value, onChange, placeholder, error, helper, endAdornment }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    error?: string | null;
    helper?: React.ReactNode;
    endAdornment?: React.ReactNode;
}) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
            onFocus={() => !value && onChange("https://")}
            onBlur={() => {
                const v = value.trim();
                if (v === "https://") onChange("");
                else if (v && !/^[a-z]+:\/\//i.test(v)) onChange(`https://${v}`);
            }}
            fullWidth
            sx={field}
            placeholder={placeholder}
            error={!!error}
            helperText={error || helper}
            inputProps={{ inputMode: "url", spellCheck: false, autoCapitalize: "off", maxLength: 2048 }}
            InputProps={endAdornment ? { endAdornment: <InputAdornment position="end">{endAdornment}</InputAdornment> } : undefined}
        />
    );
}

/** One cover image link: prefilled https://, test-loaded, thumbnail when found. */
function CoverField({
    index,
    value,
    onChange,
    onStatus,
    onRemove,
    onMove,
    count,
}: {
    index: number;
    value: string;
    onChange: (v: string) => void;
    onStatus: (s: CoverState["status"]) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    count: number;
}) {
    const url = cleanUrl(value);
    const err = urlError(value, "Cover image");
    const [st, setSt] = useState<CoverState>({ status: "empty" });
    useEffect(() => {
        if (!url) return setSt({ status: "empty" });
        if (err) return setSt({ status: "invalid" });
        setSt({ status: "checking" });
        let alive = true;
        const t = setTimeout(() => {
            const img = new Image();
            const timeout = setTimeout(() => alive && setSt({ status: "error", message: "The image took too long to load." }), 10000);
            img.onload = () => {
                clearTimeout(timeout);
                if (alive) setSt(img.naturalWidth > 0 ? { status: "ok" } : { status: "error", message: "That link isn't an image." });
            };
            img.onerror = () => {
                clearTimeout(timeout);
                if (alive) setSt({ status: "error", message: "Couldn't load this image — it may not exist (404) or isn't a direct image link." });
            };
            img.referrerPolicy = "no-referrer";
            img.src = url;
        }, 600);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [url, err]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: report status changes only
    useEffect(() => onStatus(st.status), [st.status]);

    return (
        <Stack direction="row" spacing={1.2} alignItems="flex-start">
            <Box
                sx={{
                    width: 96, height: 54, flexShrink: 0, mt: 0.6, borderRadius: "10px", overflow: "hidden",
                    border: "1px solid var(--app-border)", background: "var(--app-surface-2)", display: "grid", placeItems: "center",
                    color: "var(--app-fg-faint)", fontSize: "0.7rem", fontWeight: 700,
                }}
            >
                {st.status === "ok" ? (
                    <Box component="img" src={url} alt="" referrerPolicy="no-referrer" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                    `#${index + 1}`
                )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <HttpsField
                    label={index === 0 ? "Cover image (main)" : `Cover image ${index + 1}`}
                    value={value}
                    onChange={onChange}
                    placeholder="https://…/cover.jpg"
                    error={err || (st.status === "error" ? st.message : null)}
                    helper={st.status === "ok" ? "Image found." : index === 0 ? "Also used when the link is shared. 16:9 works best." : undefined}
                    endAdornment={
                        st.status === "checking" ? <CircularProgress size={18} /> :
                        st.status === "ok" ? <CheckCircleIcon sx={{ color: "var(--app-success)" }} /> :
                        st.status === "error" ? <ErrorOutlineIcon sx={{ color: "var(--app-danger)" }} /> : null
                    }
                />
            </Box>
            <Stack direction="row" sx={{ mt: 0.6 }}>
                <IconButton size="small" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Remove image" onClick={onRemove}><CloseIcon fontSize="small" /></IconButton>
            </Stack>
        </Stack>
    );
}

/** Cover slideshow: up to 6 images, reorder/remove, autoplay or manual. */
function CoversEditor({
    covers,
    autoplay,
    onChange,
    onAutoplay,
    onStatuses,
}: {
    covers: string[];
    autoplay: boolean;
    onChange: (v: string[]) => void;
    onAutoplay: (v: boolean) => void;
    onStatuses: (s: CoverState["status"][]) => void;
}) {
    // Stable keys so fields keep their own check state while reordering.
    const [keys, setKeys] = useState<number[]>(() => covers.map((_, i) => i));
    const nextKey = useRef(covers.length);
    const statuses = useRef<Record<number, CoverState["status"]>>({});
    const report = () => onStatuses(keys.map((k) => statuses.current[k] ?? "empty"));

    const update = (list: string[], k: number[]) => {
        setKeys(k);
        onChange(list);
    };
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "0.92rem" }}>Cover images</Typography>
                <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.78rem" }}>{covers.length}/{MAX_COVERS}</Typography>
            </Stack>
            <Stack spacing={1.4}>
                {covers.map((c, i) => (
                    <CoverField
                        key={keys[i]}
                        index={i}
                        count={covers.length}
                        value={c}
                        onChange={(v) => onChange(covers.map((x, j) => (j === i ? v : x)))}
                        onStatus={(st) => {
                            statuses.current[keys[i]] = st;
                            report();
                        }}
                        onRemove={() => {
                            delete statuses.current[keys[i]];
                            update(covers.filter((_, j) => j !== i), keys.filter((_, j) => j !== i));
                            setTimeout(report, 0);
                        }}
                        onMove={(dir) => {
                            const j = i + dir;
                            const list = [...covers];
                            const k = [...keys];
                            [list[i], list[j]] = [list[j], list[i]];
                            [k[i], k[j]] = [k[j], k[i]];
                            update(list, k);
                        }}
                    />
                ))}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ mt: 1.2 }}>
                <Button
                    onClick={() => update([...covers, ""], [...keys, nextKey.current++])}
                    disabled={covers.length >= MAX_COVERS}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: "999px", px: 2, color: "var(--app-fg)", border: "1px dashed var(--app-border)", alignSelf: "flex-start" }}
                >
                    + Add {covers.length ? "another image" : "a cover image"}
                </Button>
                {covers.length > 1 && (
                    <FormControlLabel
                        control={<Switch checked={autoplay} onChange={(e) => onAutoplay(e.target.checked)} />}
                        label={<Typography sx={{ fontSize: "0.86rem" }}>{autoplay ? "Slides advance automatically" : "Visitors move through slides themselves"}</Typography>}
                    />
                )}
            </Stack>
        </Box>
    );
}

export default function FundraiserEditor({
    initial,
    submitLabel,
    busy,
    onSubmit,
    slugLocked,
}: {
    initial: FundraiserDraft;
    submitLabel: string;
    busy: boolean;
    onSubmit: (d: FundraiserDraft) => void;
    slugLocked?: boolean;
}) {
    const [d, setD] = useState<FundraiserDraft>(initial);
    const set = (k: keyof FundraiserDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setD((p) => ({ ...p, [k]: e.target.value }));
    const patch = (p: Partial<FundraiserDraft>) => setD((prev) => ({ ...prev, ...p }));

    // ── Goal ──
    const goal = Number(d.goal_rupees || 0);
    const goalError =
        d.goal_rupees && (goal < GOAL_MIN || goal > GOAL_MAX)
            ? `Goal must be between ₹${GOAL_MIN} and ₹1,00,00,000.`
            : null;

    // ── Links ──
    const linkError = urlError(d.link_url, "GitHub or website");
    const [coverStatuses, setCoverStatuses] = useState<CoverState["status"][]>([]);
    const coverInvalid = d.covers.some((c) => urlError(c, "Cover image"));

    const blockers = useMemo(() => {
        const b: string[] = [];
        if (d.title.trim().length < 3) b.push("Add a title (at least 3 characters).");
        if (!d.goal_rupees) b.push("Set a goal.");
        if (goalError) b.push(goalError);
        if (!d.presets_inr.length) b.push("Add at least one ₹ preset.");
        if (!d.presets_usd.length) b.push("Add at least one $ preset.");
        if (linkError) b.push(linkError);
        if ((d.display_name || "").length > 80) b.push("Display name can be at most 80 characters.");
        if (coverInvalid) b.push("Every cover image must be a public https:// link.");
        if (coverStatuses.includes("checking")) b.push("Checking the cover images…");
        if (coverStatuses.includes("error")) b.push("Fix or remove the cover image that didn't load.");
        return b;
    }, [d, goalError, linkError, coverInvalid, coverStatuses]);

    return (
        <Stack spacing={2.2}>
            <TextField label="Title" value={d.title} onChange={set("title")} required fullWidth sx={field}
                inputProps={{ maxLength: 100 }} helperText="e.g. Build the first Falera badge boards" />
            <TextField
                label="Link"
                value={d.slug}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                fullWidth
                sx={field}
                disabled={slugLocked}
                placeholder="falera-badge"
                InputProps={{ startAdornment: <Box component="span" sx={{ color: "var(--app-fg-muted)", mr: 0.5, whiteSpace: "nowrap" }}>payouts.elixpo.com/f/</Box> }}
                helperText={slugLocked ? "The link can't change after publishing — it may already be on printed QR codes." : "Leave empty to use the title. Lowercase letters, numbers and hyphens."}
            />
            <TextField
                label="Display name (optional)"
                value={d.display_name}
                onChange={set("display_name")}
                fullWidth
                sx={field}
                inputProps={{ maxLength: 80 }}
                placeholder="e.g. Ayushman Bhattacharya, or Falera Badge Project"
                helperText="Shown on the page and in receipts instead of your account name — use your legal or project name."
            />
            <TextField
                label="Why you're raising money"
                value={d.body_md}
                onChange={set("body_md")}
                fullWidth
                multiline
                minRows={6}
                sx={field}
                inputProps={{ maxLength: 10000 }}
                helperText="Markdown: # heading, **bold**, *italic*, [link](https://…), - lists."
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    label="Goal"
                    value={d.goal_rupees ? Number(d.goal_rupees).toLocaleString("en-IN") : ""}
                    onChange={(e) => patch({ goal_rupees: e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8) })}
                    required
                    fullWidth
                    sx={field}
                    error={!!goalError}
                    placeholder="8,000"
                    inputProps={{ inputMode: "numeric", "aria-label": "Goal in rupees" }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><CurrencyBadge cur="INR" /></InputAdornment> }}
                    helperText={goalError || "Whole rupees, ₹100 – ₹1,00,00,000. Payments are collected in INR."}
                />
                <TextField label="Ends on (optional)" type="date" value={d.ends_at} onChange={set("ends_at")} fullWidth sx={field}
                    InputLabelProps={{ shrink: true }} inputProps={{ min: new Date().toISOString().slice(0, 10) }} />
            </Stack>

            <Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.92rem", mb: 1 }}>Preset amounts</Typography>
                <Stack spacing={1.5}>
                    <AmountChips cur="INR" values={d.presets_inr} onChange={(v) => patch({ presets_inr: v })} />
                    <AmountChips cur="USD" values={d.presets_usd} onChange={(v) => patch({ presets_usd: v })} />
                </Stack>
            </Box>

            <CoversEditor
                covers={d.covers}
                autoplay={d.cover_autoplay}
                onChange={(covers) => patch({ covers })}
                onAutoplay={(cover_autoplay) => patch({ cover_autoplay })}
                onStatuses={setCoverStatuses}
            />
            <HttpsField
                label="GitHub or website (optional)"
                value={d.link_url}
                onChange={(v) => patch({ link_url: v })}
                placeholder="https://github.com/elixpo/falera"
                error={linkError}
                helper="Shown on the page so supporters can see the project."
            />
            <TextField label="Thank-you message" value={d.thank_you_message} onChange={set("thank_you_message")} fullWidth
                multiline minRows={2} sx={field} inputProps={{ maxLength: 500 }}
                helperText="Shown after paying and included in the receipt email." />

            <Box>
                <Button
                    onClick={() => onSubmit(d)}
                    disabled={busy || blockers.length > 0}
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        px: 3,
                        py: 1.1,
                        borderRadius: "999px",
                        color: "var(--app-on-ink)",
                        background: "var(--app-ink)",
                        "&:hover": { background: "var(--app-ink)", opacity: 0.86 },
                        "&.Mui-disabled": { color: "var(--app-on-ink)", opacity: 0.45 },
                    }}
                >
                    {busy ? "Saving…" : submitLabel}
                </Button>
                {blockers.length > 0 && !busy && (
                    <Typography sx={{ mt: 0.8, fontSize: "0.78rem", color: "var(--app-fg-muted)" }}>{blockers[0]}</Typography>
                )}
            </Box>
            <Box>
                <Typography sx={{ color: "var(--app-fg-faint)", fontSize: "0.78rem" }}>
                    A fundraiser is a donation page: you can't promise goods in return. To sell something (like a pre-order),
                    use a product checkout instead.
                </Typography>
                <PolicyLinks trust="contributing" lead="By publishing you agree to the" style={{ marginTop: 6 }} />
            </Box>
        </Stack>
    );
}
