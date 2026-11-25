"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { buildQrOptions, DEFAULT_PRESET_ID, getPreset, QR_PRESETS, type QrPreset } from "@/lib/qr-presets";

type LogoMode = "elixpo" | "none" | "custom";
type FrameMode = "card" | "plain";
interface Prefs {
    preset: string;
    logo: LogoMode;
    customLogo: string;
    frame: FrameMode;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Wrap a title into ≤ 2 lines of ~24 characters for the card. */
function wrap(title: string): string[] {
    const lines: string[] = [""];
    for (const w of title.split(/\s+/)) {
        const cur = lines[lines.length - 1];
        const next = `${cur} ${w}`.trim();
        if (next.length <= 24) lines[lines.length - 1] = next;
        else if (lines.length < 2) lines.push(w);
        else {
            lines[1] = `${lines[1].slice(0, 22).trimEnd()}…`;
            break;
        }
    }
    return lines;
}

async function toDataUrl(src: string): Promise<string> {
    const blob = await (await fetch(src)).blob();
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

/** Render the styled QR to an SVG string (no DOM mounting). */
async function renderQrSvg(preset: QrPreset, data: string, image: string | undefined, size: number): Promise<string> {
    const { default: QRCodeStyling } = await import("qr-code-styling");
    const qr = new QRCodeStyling(buildQrOptions(preset, { data, image, size }));
    const raw = await qr.getRawData("svg");
    const text = raw instanceof Blob ? await raw.text() : String(raw);
    return text.replace(/<\?xml[^>]*\?>/, "").trim();
}

/**
 * Place the library's QR <svg> inside our card at (x, y, size). Its root tag
 * already carries width/height — re-adding them would duplicate attributes and
 * make the whole SVG invalid (the browser then refuses to render it) — so strip
 * the library's sizing first and keep/derive a viewBox so it scales cleanly.
 */
function nestQr(qrSvg: string, x: number, y: number, size: number, rendered: number): string {
    const open = qrSvg.match(/<svg\b[^>]*>/)?.[0];
    if (!open) return "";
    const bare = open.replace(/\s(?:width|height|x|y)="[^"]*"/g, "");
    const viewBox = /\sviewBox=/.test(bare) ? "" : ` viewBox="0 0 ${rendered} ${rendered}"`;
    return qrSvg.replace(open, bare.replace("<svg", `<svg x="${x}" y="${y}" width="${size}" height="${size}"${viewBox}`));
}

/** The branded card: title, the QR on a plate, the link and the Elixpo Pay mark. */
function cardSvg(qrSvg: string, p: QrPreset, title: string, url: string, brandLogo: string): string {
    const f = p.frame;
    const lines = wrap(title);
    const titleSvg = lines
        .map(
            (l, i) =>
                `<text x="300" y="${138 + i * 48}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" letter-spacing="-1" fill="${f.ink}">${esc(l)}</text>`,
        )
        .join("");
    const qrTop = lines.length > 1 ? 222 : 186;
    const inner = nestQr(qrSvg, 70, qrTop + 20, 460, 460);
    const short = url.replace(/^https?:\/\//, "");
    const h = qrTop + 500 + 150;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="600" height="${h}" viewBox="0 0 600 ${h}">
<rect width="600" height="${h}" rx="40" fill="${f.bg}"/>
<text x="300" y="80" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="17" font-weight="700" letter-spacing="4" fill="${f.accent}">SCAN TO SUPPORT</text>
${titleSvg}
<rect x="50" y="${qrTop}" width="500" height="500" rx="30" fill="${p.bg}" stroke="${f.muted}" stroke-opacity="0.25"/>
${inner}
<text x="300" y="${qrTop + 548}" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="20" fill="${f.muted}">${esc(short)}</text>
<g transform="translate(${300 - 82} ${qrTop + 580})">
  <image href="${brandLogo}" xlink:href="${brandLogo}" x="0" y="0" width="34" height="34"/>
  <text x="44" y="25" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" fill="${f.ink}">Elixpo <tspan font-weight="400" fill="${f.muted}">Pay</tspan></text>
</g>
</svg>`;
}

/** QR only, on its own background with a quiet zone. */
function plainSvg(qrSvg: string, p: QrPreset): string {
    const inner = nestQr(qrSvg, 40, 40, 460, 460);
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="540" height="540" viewBox="0 0 540 540"><rect width="540" height="540" fill="${p.bg}"/>${inner}</svg>`;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

async function svgToPng(svg: string, scale = 2): Promise<Blob> {
    const img = new Image();
    img.src = svgUrl(svg);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

function download(name: string, blob: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const pill = (active: boolean) => ({
    textTransform: "none",
    fontWeight: 700,
    fontSize: "0.82rem",
    borderRadius: "999px",
    px: 1.6,
    py: 0.5,
    minWidth: 0,
    color: active ? "var(--app-on-ink)" : "var(--app-fg)",
    background: active ? "var(--app-ink)" : "transparent",
    border: `1px solid ${active ? "var(--app-ink)" : "var(--app-border)"}`,
    "&:hover": { background: active ? "var(--app-ink)" : "var(--app-overlay)" },
});

/**
 * QR share studio (modelled on lixrl.com): style presets, centre logo, branded
 * card or plain code, live preview, PNG/SVG download and copy-to-clipboard.
 */
export default function FundraiserQr({ url, title, slug }: { url: string; title: string; slug: string }) {
    const storeKey = `elixpo-pay:qr:${slug}`;
    const [prefs, setPrefs] = useState<Prefs>({ preset: DEFAULT_PRESET_ID, logo: "elixpo", customLogo: "", frame: "card" });
    const [svg, setSvg] = useState("");
    const [busy, setBusy] = useState(true);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

    // Remember the creator's choice per fundraiser (best-effort).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storeKey);
            if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
        } catch {
            /* storage unavailable */
        }
    }, [storeKey]);
    const update = (p: Partial<Prefs>) =>
        setPrefs((prev) => {
            const next = { ...prev, ...p };
            try {
                localStorage.setItem(storeKey, JSON.stringify(next));
            } catch {
                /* ignore */
            }
            return next;
        });

    const preset = useMemo(() => getPreset(prefs.preset), [prefs.preset]);
    const customLogoOk = /^https:\/\/[^\s/]+\.[^\s]+/i.test(prefs.customLogo.trim());

    useEffect(() => {
        let alive = true;
        setBusy(true);
        const t = setTimeout(async () => {
            try {
                const brand = await toDataUrl("/icon.png");
                let image: string | undefined;
                if (prefs.logo === "elixpo") image = brand;
                else if (prefs.logo === "custom" && customLogoOk) image = await toDataUrl(prefs.customLogo.trim()).catch(() => undefined);
                if (prefs.logo === "custom" && customLogoOk && !image && alive) {
                    setNote({ ok: false, text: "That logo couldn't be loaded (the site may block embedding). Showing the code without it." });
                }
                const qr = await renderQrSvg(preset, url, image, 460);
                if (!alive) return;
                setSvg(prefs.frame === "card" ? cardSvg(qr, preset, title, url, brand) : plainSvg(qr, preset));
            } catch {
                if (alive) setNote({ ok: false, text: "Couldn't render the QR code. Try another style." });
            } finally {
                if (alive) setBusy(false);
            }
        }, 150);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [preset, prefs.logo, prefs.customLogo, prefs.frame, customLogoOk, url, title]);

    const copyImage = async () => {
        try {
            const png = await svgToPng(svg);
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
            setNote({ ok: true, text: "QR image copied — paste it into a chat, doc or slide." });
        } catch {
            setNote({ ok: false, text: "This browser can't copy images. Download the PNG instead." });
        }
    };

    return (
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ md: "flex-start" }}>
            <Box sx={{ flexShrink: 0, width: { xs: "100%", sm: 300 }, maxWidth: 300, mx: { xs: "auto", md: 0 } }}>
                <Box
                    sx={{
                        position: "relative",
                        borderRadius: "20px",
                        overflow: "hidden",
                        border: "1px solid var(--app-border)",
                        background: "var(--app-surface-2)",
                        aspectRatio: prefs.frame === "card" ? "600 / 860" : "1 / 1",
                        display: "grid",
                        placeItems: "center",
                    }}
                >
                    {svg && (
                        <Box component="img" src={svgUrl(svg)} alt={`QR code for ${url}`} sx={{ width: "100%", height: "100%", display: "block", objectFit: "contain", opacity: busy ? 0.5 : 1, transition: "opacity .2s" }} />
                    )}
                    {busy && <CircularProgress size={26} sx={{ position: "absolute" }} />}
                </Box>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                    <Button onClick={async () => svg && download(`${slug}-qr.png`, await svgToPng(svg))} disabled={!svg || busy} startIcon={<DownloadIcon />} sx={pill(true)}>
                        PNG
                    </Button>
                    <Button onClick={() => svg && download(`${slug}-qr.svg`, new Blob([svg], { type: "image/svg+xml" }))} disabled={!svg || busy} startIcon={<DownloadIcon />} sx={pill(false)}>
                        SVG
                    </Button>
                    <Button onClick={copyImage} disabled={!svg || busy} startIcon={<ContentCopyIcon />} sx={pill(false)}>
                        Copy
                    </Button>
                </Stack>
            </Box>

            <Stack spacing={2.2} sx={{ flex: 1, minWidth: 0 }}>
                <Box>
                    <Typography sx={label}>Style</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {QR_PRESETS.map((p) => (
                            <Box
                                key={p.id}
                                component="button"
                                type="button"
                                onClick={() => update({ preset: p.id })}
                                aria-pressed={prefs.preset === p.id}
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 0.6,
                                    p: 0.8,
                                    width: 74,
                                    borderRadius: "14px",
                                    cursor: "pointer",
                                    background: "transparent",
                                    color: "var(--app-fg)",
                                    border: `2px solid ${prefs.preset === p.id ? "var(--app-ink)" : "var(--app-border)"}`,
                                    font: "inherit",
                                }}
                            >
                                <Box sx={{ width: 34, height: 34, borderRadius: p.dotsType === "dots" ? "50%" : p.dotsType === "square" ? "4px" : "10px", background: p.swatch, boxShadow: p.bg !== "#ffffff" ? "none" : "inset 0 0 0 3px #fff" }} />
                                <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>{p.name}</span>
                            </Box>
                        ))}
                    </Stack>
                </Box>

                <Box>
                    <Typography sx={label}>Centre logo</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button sx={pill(prefs.logo === "elixpo")} onClick={() => update({ logo: "elixpo" })}>Elixpo panda</Button>
                        <Button sx={pill(prefs.logo === "custom")} onClick={() => update({ logo: "custom" })}>My logo</Button>
                        <Button sx={pill(prefs.logo === "none")} onClick={() => update({ logo: "none" })}>None</Button>
                    </Stack>
                    {prefs.logo === "custom" && (
                        <TextField
                            size="small"
                            fullWidth
                            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: "12px", background: "var(--app-bg)" } }}
                            placeholder="https://yoursite.com/logo.png"
                            value={prefs.customLogo}
                            onFocus={() => !prefs.customLogo && update({ customLogo: "https://" })}
                            onChange={(e) => update({ customLogo: e.target.value.replace(/\s/g, "") })}
                            error={!!prefs.customLogo && prefs.customLogo !== "https://" && !customLogoOk}
                            helperText="A square PNG or SVG works best. The site must allow embedding (CORS)."
                        />
                    )}
                </Box>

                <Box>
                    <Typography sx={label}>Layout</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button sx={pill(prefs.frame === "card")} onClick={() => update({ frame: "card" })}>Branded card</Button>
                        <Button sx={pill(prefs.frame === "plain")} onClick={() => update({ frame: "plain" })}>QR only</Button>
                    </Stack>
                    <Typography sx={{ mt: 0.8, fontSize: "0.78rem", color: "var(--app-fg-muted)" }}>
                        The card adds “Scan to support”, your title, the link and the Elixpo Pay mark — ready to print on
                        the badge box, a poster or a slide.
                    </Typography>
                </Box>

                {note && (
                    <Alert severity={note.ok ? "success" : "warning"} onClose={() => setNote(null)}>
                        {note.text}
                    </Alert>
                )}
            </Stack>
        </Stack>
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
