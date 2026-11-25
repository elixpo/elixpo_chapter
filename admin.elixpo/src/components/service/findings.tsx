"use client";

import { CodeBadge, Pill, pct } from "@/components/service/kit";
import { C, Empty, eyebrow } from "@/components/ui";
import type { Finding } from "@/lib/diagnostics";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

const SEV = {
    critical: { tone: "error", label: "Critical", color: C.error },
    warning: { tone: "warn", label: "Warning", color: C.warn },
    info: { tone: "blue", label: "Info", color: C.blue },
} as const;

/** Compact one-line-per-finding list (overview). */
export function FindingList({
    findings,
    href,
}: { findings: Finding[]; href: string }) {
    if (!findings.length)
        return (
            <Empty message="No non-2xx findings for this host in this window." />
        );
    return (
        <Box>
            {findings.slice(0, 6).map((f) => (
                <Box
                    key={f.id}
                    component={Link}
                    href={href}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        py: 1,
                        px: 1.5,
                        borderBottom: `1px solid ${C.border}`,
                        textDecoration: "none",
                        color: C.text,
                        "&:hover": { bgcolor: C.panelHover },
                    }}
                >
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            flexShrink: 0,
                            bgcolor: SEV[f.severity].color,
                        }}
                    />
                    <CodeBadge code={f.status} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            sx={{
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {f.title}
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: "0.72rem",
                                color: C.textMuted,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {f.reasons[0]}
                        </Typography>
                    </Box>
                    <Typography
                        sx={{
                            fontSize: "0.75rem",
                            color: C.textDim,
                            fontFamily: C.mono,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {f.count.toLocaleString()} · {pct(f.share)}
                    </Typography>
                </Box>
            ))}
            {findings.length > 6 && (
                <Box sx={{ px: 1.5, py: 1, fontSize: "0.76rem" }}>
                    <Box
                        component={Link}
                        href={href}
                        sx={{
                            color: C.green,
                            fontWeight: 650,
                            textDecoration: "none",
                        }}
                    >
                        {findings.length - 6} more →
                    </Box>
                </Box>
            )}
        </Box>
    );
}

/** Expandable finding card with reasons, fixes and top paths (status tab). */
export function FindingCard({ f }: { f: Finding }) {
    const [open, setOpen] = useState(f.severity === "critical");
    const sev = SEV[f.severity];
    return (
        <Box
            sx={{
                bgcolor: C.panel,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${sev.color}`,
                borderRadius: "14px",
                overflow: "hidden",
            }}
        >
            <Box
                component="button"
                onClick={() => setOpen((o) => !o)}
                sx={{
                    all: "unset",
                    boxSizing: "border-box",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    px: 1.75,
                    py: 1.25,
                    cursor: "pointer",
                    "&:hover": { bgcolor: C.panelHover },
                }}
            >
                <CodeBadge code={f.status} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                        sx={{
                            fontSize: "0.88rem",
                            fontWeight: 650,
                            color: C.text,
                        }}
                    >
                        {f.title}
                    </Typography>
                    <Typography
                        sx={{ fontSize: "0.72rem", color: C.textMuted }}
                    >
                        {f.count.toLocaleString()} requests · {pct(f.share)} of
                        host traffic
                    </Typography>
                </Box>
                <Pill tone={sev.tone}>{sev.label}</Pill>
            </Box>
            {open && (
                <Box
                    sx={{
                        px: 1.75,
                        pb: 1.75,
                        pt: 0.5,
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" },
                    }}
                >
                    <Box>
                        <Typography
                            sx={{ ...eyebrow, color: C.textMuted, mb: 0.75 }}
                        >
                            Why
                        </Typography>
                        <Box
                            component="ul"
                            sx={{
                                m: 0,
                                pl: 2.25,
                                fontSize: "0.8rem",
                                color: C.text,
                                lineHeight: 1.55,
                            }}
                        >
                            {f.reasons.map((r) => (
                                <li key={r}>{r}</li>
                            ))}
                        </Box>
                        {f.fixes.length > 0 && (
                            <>
                                <Typography
                                    sx={{
                                        ...eyebrow,
                                        color: C.green,
                                        mt: 1.5,
                                        mb: 0.75,
                                    }}
                                >
                                    What to do
                                </Typography>
                                <Box
                                    component="ul"
                                    sx={{
                                        m: 0,
                                        pl: 2.25,
                                        fontSize: "0.8rem",
                                        color: C.textDim,
                                        lineHeight: 1.55,
                                    }}
                                >
                                    {f.fixes.map((r) => (
                                        <li key={r}>{r}</li>
                                    ))}
                                </Box>
                            </>
                        )}
                    </Box>
                    {f.topPaths.length > 0 && (
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                sx={{
                                    ...eyebrow,
                                    color: C.textMuted,
                                    mb: 0.75,
                                }}
                            >
                                Top paths
                            </Typography>
                            {f.topPaths.map((p) => (
                                <Box
                                    key={p.path}
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 1,
                                        py: 0.5,
                                        borderBottom: `1px solid ${C.border}`,
                                        fontSize: "0.75rem",
                                    }}
                                >
                                    <Box
                                        component="span"
                                        title={p.path}
                                        sx={{
                                            fontFamily: C.mono,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            minWidth: 0,
                                        }}
                                    >
                                        {p.path}
                                    </Box>
                                    <Box
                                        component="span"
                                        sx={{
                                            color: C.textDim,
                                            fontFamily: C.mono,
                                        }}
                                    >
                                        {p.count.toLocaleString()}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}
