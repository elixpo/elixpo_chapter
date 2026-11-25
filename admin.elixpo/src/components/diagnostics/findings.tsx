"use client";

/** "Why it's not 2xx" — ranked, collapsible finding cards. */

import { C, eyebrow } from "@/components/ui";
import {
    type Finding,
    type Severity,
    statusInfo,
} from "@/lib/diagnostics-core";
import { ArrowOutward, ExpandMore } from "@mui/icons-material";
import { Box, Collapse, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { CodeChip, PillButton, SEV, SevChip, num, pct } from "./shared";

const PAGE = 12;

export default function Findings({
    findings,
    onCode,
    activeCodes,
}: {
    findings: Finding[];
    onCode: (code: number) => void;
    activeCodes: number[];
}) {
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [limit, setLimit] = useState(PAGE);

    const counts = useMemo(() => {
        const c: Record<Severity, number> = {
            critical: 0,
            warning: 0,
            info: 0,
        };
        for (const f of findings) c[f.severity]++;
        return c;
    }, [findings]);

    if (!findings.length)
        return (
            <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography sx={{ fontWeight: 650, color: C.green }}>
                    Nothing to explain.
                </Typography>
                <Typography
                    sx={{ color: C.textMuted, fontSize: "0.8rem", mt: 0.5 }}
                >
                    No non-2xx responses match the current filters.
                </Typography>
            </Box>
        );

    const isOpen = (f: Finding) => open[f.id] ?? f.severity === "critical";
    const shown = findings.slice(0, limit);

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    px: { xs: 1.5, md: 2 },
                    py: 1.25,
                    borderBottom: `1px solid ${C.border}`,
                    alignItems: "center",
                }}
            >
                {(Object.keys(counts) as Severity[]).map((s) => (
                    <Box
                        key={s}
                        sx={{ display: "flex", alignItems: "center", gap: 0.6 }}
                    >
                        <SevChip sev={s} />
                        <Typography
                            sx={{ fontSize: "0.8rem", fontWeight: 700, mr: 1 }}
                        >
                            {counts[s]}
                        </Typography>
                    </Box>
                ))}
                <Box sx={{ flex: 1 }} />
                <PillButton
                    onClick={() =>
                        setOpen(
                            Object.fromEntries(shown.map((f) => [f.id, true])),
                        )
                    }
                >
                    Expand all
                </PillButton>
                <PillButton
                    onClick={() =>
                        setOpen(
                            Object.fromEntries(shown.map((f) => [f.id, false])),
                        )
                    }
                >
                    Collapse all
                </PillButton>
            </Box>
            {shown.map((f) => {
                const sev = SEV[f.severity];
                const o = isOpen(f);
                const info = statusInfo(f.status);
                return (
                    <Box
                        key={f.id}
                        sx={{
                            borderBottom: `1px solid ${C.border}`,
                            borderLeft: `3px solid ${sev.color}`,
                        }}
                    >
                        <Box
                            component="button"
                            onClick={() =>
                                setOpen((m) => ({ ...m, [f.id]: !o }))
                            }
                            aria-expanded={o}
                            sx={{
                                all: "unset",
                                boxSizing: "border-box",
                                width: "100%",
                                cursor: "pointer",
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "1fr auto",
                                    md: "auto minmax(0,1fr) auto auto",
                                },
                                alignItems: "center",
                                gap: { xs: 0.75, md: 1.5 },
                                px: { xs: 1.5, md: 2 },
                                py: 1.25,
                                "&:hover": { bgcolor: C.paper },
                            }}
                        >
                            <Box sx={{ display: { xs: "none", md: "block" } }}>
                                <SevChip sev={f.severity} />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.75,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Box sx={{ display: { md: "none" } }}>
                                        <SevChip sev={f.severity} />
                                    </Box>
                                    <CodeChip code={f.status} />
                                    <Typography
                                        sx={{
                                            fontWeight: 650,
                                            fontSize: "0.92rem",
                                            letterSpacing: "-0.02em",
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {f.host}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: C.textMuted,
                                            fontSize: "0.82rem",
                                        }}
                                    >
                                        {info.name}
                                    </Typography>
                                </Box>
                                <Typography
                                    sx={{
                                        color: C.textDim,
                                        fontSize: "0.78rem",
                                        mt: 0.35,
                                        display: "-webkit-box",
                                        WebkitLineClamp: o ? "unset" : 1,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                    }}
                                >
                                    {f.reasons[0]}
                                </Typography>
                            </Box>
                            <Box
                                sx={{
                                    textAlign: "right",
                                    gridColumn: { xs: "1 / 2", md: "auto" },
                                    display: "flex",
                                    gap: 1.5,
                                    justifyContent: {
                                        xs: "flex-start",
                                        md: "flex-end",
                                    },
                                }}
                            >
                                <Box>
                                    <Typography
                                        sx={{
                                            fontWeight: 750,
                                            fontSize: "1.05rem",
                                            letterSpacing: "-0.03em",
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {num(f.count)}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            ...eyebrow,
                                            color: C.textMuted,
                                            fontSize: "0.56rem",
                                        }}
                                    >
                                        requests
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography
                                        sx={{
                                            fontWeight: 750,
                                            fontSize: "1.05rem",
                                            letterSpacing: "-0.03em",
                                            color: sev.text,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {pct(f.share)}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            ...eyebrow,
                                            color: C.textMuted,
                                            fontSize: "0.56rem",
                                        }}
                                    >
                                        of host
                                    </Typography>
                                </Box>
                            </Box>
                            <ExpandMore
                                sx={{
                                    color: C.textMuted,
                                    transform: o ? "rotate(180deg)" : "none",
                                    transition: "transform .2s",
                                    gridRow: { xs: "1 / 3", md: "auto" },
                                    gridColumn: { xs: "2", md: "auto" },
                                }}
                            />
                        </Box>
                        <Collapse in={o} unmountOnExit>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: {
                                        xs: "1fr",
                                        md: "minmax(0,1.4fr) minmax(0,1fr)",
                                    },
                                    gap: 2,
                                    px: { xs: 1.5, md: 2 },
                                    pb: 2,
                                    pt: 0.5,
                                }}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                                        Why — evidence
                                    </Typography>
                                    <Box
                                        component="ol"
                                        sx={{
                                            m: 0,
                                            pl: 2.25,
                                            display: "grid",
                                            gap: 0.6,
                                        }}
                                    >
                                        {f.reasons.map((r, i) => (
                                            <Typography
                                                component="li"
                                                key={i}
                                                sx={{
                                                    fontSize: "0.82rem",
                                                    color: C.text,
                                                    lineHeight: 1.5,
                                                    overflowWrap: "anywhere",
                                                }}
                                            >
                                                {r}
                                            </Typography>
                                        ))}
                                    </Box>
                                    {f.internalCount != null &&
                                        f.internalCount > 0 && (
                                            <Typography
                                                sx={{
                                                    mt: 1,
                                                    fontFamily: C.mono,
                                                    fontSize: "0.68rem",
                                                    color: C.textMuted,
                                                }}
                                            >
                                                visitors{" "}
                                                {num(f.visitorCount ?? 0)} ·
                                                internal {num(f.internalCount)}
                                            </Typography>
                                        )}
                                    <Typography
                                        sx={{
                                            ...eyebrow,
                                            mt: 2,
                                            mb: 0.75,
                                            color: C.green,
                                        }}
                                    >
                                        Suggested fixes
                                    </Typography>
                                    <Box
                                        component="ul"
                                        sx={{
                                            m: 0,
                                            pl: 2.25,
                                            display: "grid",
                                            gap: 0.5,
                                        }}
                                    >
                                        {f.fixes.map((x, i) => (
                                            <Typography
                                                component="li"
                                                key={i}
                                                sx={{
                                                    fontSize: "0.8rem",
                                                    color: C.textDim,
                                                    lineHeight: 1.5,
                                                }}
                                            >
                                                {x}
                                            </Typography>
                                        ))}
                                    </Box>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                                        Top paths
                                    </Typography>
                                    {f.topPaths.length ? (
                                        <Box
                                            sx={{
                                                border: `1px solid ${C.border}`,
                                                borderRadius: "12px",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {f.topPaths.map((p) => (
                                                <Box
                                                    key={p.path}
                                                    sx={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        gap: 1,
                                                        px: 1.25,
                                                        py: 0.6,
                                                        borderBottom: `1px solid ${C.border}`,
                                                        "&:last-of-type": {
                                                            borderBottom:
                                                                "none",
                                                        },
                                                    }}
                                                >
                                                    <Typography
                                                        title={p.path}
                                                        sx={{
                                                            fontFamily: C.mono,
                                                            fontSize: "0.72rem",
                                                            overflow: "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        {p.path}
                                                    </Typography>
                                                    <Typography
                                                        sx={{
                                                            fontSize: "0.72rem",
                                                            color: C.textMuted,
                                                            fontVariantNumeric:
                                                                "tabular-nums",
                                                        }}
                                                    >
                                                        {num(p.count)}
                                                    </Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    ) : (
                                        <Typography
                                            sx={{
                                                fontSize: "0.78rem",
                                                color: C.textMuted,
                                            }}
                                        >
                                            No path sample for this code
                                            (outside the top request groups).
                                        </Typography>
                                    )}
                                    <Box
                                        sx={{
                                            display: "flex",
                                            gap: 1,
                                            mt: 1.5,
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <PillButton
                                            dark
                                            href={`/dashboard/services/${encodeURIComponent(f.host)}?tab=status`}
                                        >
                                            Open service{" "}
                                            <ArrowOutward
                                                sx={{ fontSize: "0.85rem" }}
                                            />
                                        </PillButton>
                                        <PillButton
                                            onClick={() => onCode(f.status)}
                                        >
                                            {activeCodes.includes(f.status)
                                                ? `Clear ${f.status} filter`
                                                : `Filter to ${f.status}`}
                                        </PillButton>
                                    </Box>
                                </Box>
                            </Box>
                        </Collapse>
                    </Box>
                );
            })}
            {findings.length > limit && (
                <Box
                    sx={{ display: "flex", justifyContent: "center", py: 1.5 }}
                >
                    <PillButton onClick={() => setLimit((l) => l + PAGE * 2)}>
                        Show more ({findings.length - limit} left)
                    </PillButton>
                </Box>
            )}
        </Box>
    );
}
