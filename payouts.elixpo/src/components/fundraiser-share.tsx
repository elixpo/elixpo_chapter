"use client";

import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EmailIcon from "@mui/icons-material/Email";
import IosShareIcon from "@mui/icons-material/IosShare";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TelegramIcon from "@mui/icons-material/Telegram";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import XIcon from "@mui/icons-material/X";
import { Box, Button, Dialog, DialogContent, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

export interface ShareInfo {
    url: string;
    title: string;
    ownerName?: string | null;
    raised: number; // minor
    goal: number; // minor
    contributors: number;
    endsAt?: string | null;
}

const inr = (minor: number) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;

/** Ready-to-paste messages, filled with the fundraiser's live numbers. */
function templates(s: ShareInfo) {
    const pct = s.goal ? Math.min(100, Math.round((s.raised / s.goal) * 100)) : 0;
    const left = Math.max(0, s.goal - s.raised);
    const ends = s.endsAt ? ` It closes on ${new Date(s.endsAt.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.` : "";
    return [
        {
            id: "short",
            name: "Quick",
            text: `I'm raising ${inr(s.goal)} for ${s.title}. Every bit helps — chip in here: ${s.url}`,
        },
        {
            id: "story",
            name: "Story",
            text: `Hey! I've started a fundraiser: ${s.title}.\n\nI'm aiming for ${inr(s.goal)}${s.raised ? `, and ${s.contributors} ${s.contributors === 1 ? "person has" : "people have"} already put in ${inr(s.raised)}` : ""}.${ends} If you'd like to help, you can contribute any amount with UPI or a card — no account needed:\n\n${s.url}\n\nSharing it with one friend helps just as much. Thank you!`,
        },
        {
            id: "progress",
            name: "Progress update",
            text: s.raised
                ? `Update: we're ${pct}% of the way to ${inr(s.goal)} for ${s.title}! ${s.contributors} ${s.contributors === 1 ? "supporter" : "supporters"} so far — ${inr(left)} to go.${ends} ${s.url}`
                : `We're just getting started on ${s.title} — help us take the first step towards ${inr(s.goal)}: ${s.url}`,
        },
        {
            id: "last",
            name: "Last call",
            text: `Last call for ${s.title}! ${left ? `Just ${inr(left)} left to reach ${inr(s.goal)}.` : "We hit the goal — thank you!"}${ends} If you've been meaning to chip in, now's the moment: ${s.url}`,
        },
    ];
}

function shareLinks(text: string, s: ShareInfo) {
    const t = encodeURIComponent(text);
    const u = encodeURIComponent(s.url);
    return [
        { id: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon />, href: `https://wa.me/?text=${t}` },
        { id: "x", label: "X", icon: <XIcon />, href: `https://twitter.com/intent/tweet?text=${t}` },
        { id: "linkedin", label: "LinkedIn", icon: <LinkedInIcon />, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
        { id: "telegram", label: "Telegram", icon: <TelegramIcon />, href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text.replace(s.url, "").trim())}` },
        { id: "email", label: "Email", icon: <EmailIcon />, href: `mailto:?subject=${encodeURIComponent(`Support ${s.title}`)}&body=${t}` },
    ];
}

/** "Share" dialog: copy the link, pick a ready-made message, send it anywhere. */
export default function FundraiserShareDialog({ open, onClose, info }: { open: boolean; onClose: () => void; info: ShareInfo }) {
    const all = useMemo(() => templates(info), [info]);
    const [tpl, setTpl] = useState(all[0].id);
    const [text, setText] = useState(all[0].text);
    const [copied, setCopied] = useState<string | null>(null);
    const [canShare, setCanShare] = useState(false);

    useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);
    useEffect(() => {
        if (open) {
            setTpl(all[0].id);
            setText(all[0].text);
        }
    }, [open, all]);

    const copy = async (value: string, what: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(what);
            setTimeout(() => setCopied(null), 1800);
        } catch {
            /* clipboard blocked */
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: "22px", background: "var(--app-surface)", backgroundImage: "none" } }}>
            <DialogContent sx={{ p: { xs: 2.2, sm: 3 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.35rem", letterSpacing: "-0.03em" }}>Share your fundraiser</Typography>
                        <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.86rem" }}>Pick a message, tweak it, and send it anywhere.</Typography>
                    </Box>
                    <IconButton onClick={onClose} aria-label="Close" size="small">
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, pl: 1.6, borderRadius: "14px", background: "var(--app-surface-2)", mb: 2.2 }}>
                    <Box sx={{ flex: 1, minWidth: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {info.url}
                    </Box>
                    <Button onClick={() => copy(info.url, "link")} startIcon={copied === "link" ? <CheckIcon /> : <ContentCopyIcon />} sx={inkBtn}>
                        {copied === "link" ? "Copied" : "Copy link"}
                    </Button>
                </Stack>

                <Typography sx={label}>Message</Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mb: 1.2 }}>
                    {all.map((t) => (
                        <Button
                            key={t.id}
                            onClick={() => {
                                setTpl(t.id);
                                setText(t.text);
                            }}
                            sx={chip(tpl === t.id)}
                        >
                            {t.name}
                        </Button>
                    ))}
                </Stack>
                <TextField
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    multiline
                    minRows={4}
                    fullWidth
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "14px", background: "var(--app-bg)", fontSize: "0.92rem", lineHeight: 1.6 } }}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
                    <Button onClick={() => copy(text, "text")} startIcon={copied === "text" ? <CheckIcon /> : <ContentCopyIcon />} sx={inkBtn}>
                        {copied === "text" ? "Copied!" : "Copy message"}
                    </Button>
                    {canShare && (
                        <Button
                            onClick={() => navigator.share({ title: info.title, text: text.replace(info.url, "").trim(), url: info.url }).catch(() => {})}
                            startIcon={<IosShareIcon />}
                            sx={ghostBtn}
                        >
                            More apps
                        </Button>
                    )}
                </Stack>

                <Typography sx={{ ...label, mt: 2.6 }}>Send with</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {shareLinks(text, info).map((s) => (
                        <Button key={s.id} component="a" href={s.href} target="_blank" rel="noopener noreferrer" startIcon={s.icon} sx={ghostBtn}>
                            {s.label}
                        </Button>
                    ))}
                </Stack>
            </DialogContent>
        </Dialog>
    );
}

const label = {
    mb: 1,
    color: "var(--app-fg-muted)",
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
};
const inkBtn = {
    textTransform: "none",
    fontWeight: 700,
    borderRadius: "999px",
    px: 2,
    flexShrink: 0,
    color: "var(--app-on-ink)",
    background: "var(--app-ink)",
    "&:hover": { background: "var(--app-ink)", opacity: 0.86 },
};
const ghostBtn = {
    textTransform: "none",
    fontWeight: 700,
    borderRadius: "999px",
    px: 1.8,
    color: "var(--app-fg)",
    border: "1px solid var(--app-border)",
    "&:hover": { borderColor: "var(--app-fg)" },
};
const chip = (on: boolean) => ({
    textTransform: "none",
    fontWeight: 700,
    fontSize: "0.8rem",
    borderRadius: "999px",
    px: 1.5,
    py: 0.4,
    minWidth: 0,
    color: on ? "var(--app-on-ink)" : "var(--app-fg)",
    background: on ? "var(--app-ink)" : "transparent",
    border: `1px solid ${on ? "var(--app-ink)" : "var(--app-border)"}`,
    "&:hover": { background: on ? "var(--app-ink)" : "var(--app-overlay)" },
});
