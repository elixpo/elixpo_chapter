"use client";

/** Every status code seen (with share + meaning) and the code glossary. */

import { C, STATUS_COLORS, eyebrow } from "@/components/ui";
import { classOf, statusInfo } from "@/lib/diagnostics-core";
import { Box, Typography } from "@mui/material";
import { CodeChip, num, pct } from "./shared";

export interface CodeStat {
    status: number;
    count: number;
    hosts: number;
}

export function CodeDistribution({
    codes,
    total,
    activeCodes,
    codeOk,
    onCode,
}: {
    codes: CodeStat[];
    total: number;
    activeCodes: number[];
    codeOk: (code: number) => boolean;
    onCode: (code: number) => void;
}) {
    if (!codes.length)
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 3,
                    textAlign: "center",
                }}
            >
                No requests in this window.
            </Typography>
        );
    const max = Math.max(...codes.map((c) => c.count), 1);
    return (
        <Box>
            {codes.map((c) => {
                const info = statusInfo(c.status);
                const color = STATUS_COLORS[classOf(c.status)];
                const active = activeCodes.includes(c.status);
                const dim = !codeOk(c.status);
                return (
                    <Box
                        key={c.status}
                        component="button"
                        onClick={() => onCode(c.status)}
                        title={
                            active
                                ? "Clear this code filter"
                                : `Filter everything to ${c.status}`
                        }
                        sx={{
                            all: "unset",
                            boxSizing: "border-box",
                            cursor: "pointer",
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "64px minmax(0,1fr) auto",
                                md: "70px minmax(0,220px) minmax(0,1fr) 150px 90px",
                            },
                            alignItems: "center",
                            gap: { xs: 1, md: 1.5 },
                            px: { xs: 1.5, md: 2 },
                            py: 0.9,
                            borderBottom: `1px solid ${C.border}`,
                            opacity: dim ? 0.4 : 1,
                            bgcolor: active ? C.paperDeep : "transparent",
                            "&:hover": { bgcolor: C.paper },
                            "&:last-of-type": { borderBottom: "none" },
                        }}
                    >
                        <CodeChip code={c.status} active={active} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                sx={{ fontWeight: 650, fontSize: "0.84rem" }}
                            >
                                {info.name}
                            </Typography>
                            <Typography
                                sx={{
                                    display: { xs: "block", md: "none" },
                                    fontSize: "0.74rem",
                                    color: C.textMuted,
                                }}
                            >
                                {info.meaning}
                            </Typography>
                        </Box>
                        <Typography
                            sx={{
                                display: { xs: "none", md: "block" },
                                fontSize: "0.78rem",
                                color: C.textDim,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {info.meaning}
                        </Typography>
                        <Box sx={{ display: { xs: "none", md: "block" } }}>
                            <Box
                                sx={{
                                    height: 8,
                                    borderRadius: "999px",
                                    bgcolor: C.paperDeep,
                                    overflow: "hidden",
                                }}
                            >
                                <Box
                                    sx={{
                                        width: `${Math.max(1.5, (c.count / max) * 100)}%`,
                                        height: "100%",
                                        bgcolor: color,
                                    }}
                                />
                            </Box>
                            <Typography
                                sx={{
                                    fontFamily: C.mono,
                                    fontSize: "0.6rem",
                                    color: C.textMuted,
                                    mt: 0.3,
                                }}
                            >
                                {c.hosts} host{c.hosts === 1 ? "" : "s"}
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                            <Typography
                                sx={{
                                    fontWeight: 700,
                                    fontSize: "0.84rem",
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {num(c.count)}
                            </Typography>
                            <Typography
                                sx={{ fontSize: "0.68rem", color: C.textMuted }}
                            >
                                {pct(c.count / (total || 1))}
                            </Typography>
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

export function CodeGlossary({ codes }: { codes: number[] }) {
    if (!codes.length)
        return (
            <Typography
                sx={{
                    color: C.textMuted,
                    fontSize: "0.82rem",
                    py: 2,
                    textAlign: "center",
                }}
            >
                No codes to explain.
            </Typography>
        );
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0,1fr))",
                    lg: "repeat(3, minmax(0,1fr))",
                },
                gap: 1.25,
            }}
        >
            {codes.map((code) => {
                const info = statusInfo(code);
                const color = STATUS_COLORS[classOf(code)];
                return (
                    <Box
                        key={code}
                        sx={{
                            border: `1px solid ${C.border}`,
                            borderTop: `3px solid ${color}`,
                            borderRadius: "14px",
                            p: 1.5,
                            minWidth: 0,
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: 1,
                            }}
                        >
                            <Typography
                                sx={{
                                    fontFamily: C.mono,
                                    fontWeight: 700,
                                    fontSize: "1.1rem",
                                    color: C.text,
                                }}
                            >
                                {code}
                            </Typography>
                            <Typography
                                sx={{ fontWeight: 650, fontSize: "0.86rem" }}
                            >
                                {info.name}
                            </Typography>
                            {info.benign && (
                                <Box
                                    component="span"
                                    sx={{
                                        ml: "auto",
                                        fontFamily: C.mono,
                                        fontSize: "0.56rem",
                                        letterSpacing: "0.1em",
                                        textTransform: "uppercase",
                                        color: C.green,
                                        border: `1px solid ${C.green}44`,
                                        borderRadius: "999px",
                                        px: 0.7,
                                    }}
                                >
                                    usually benign
                                </Box>
                            )}
                        </Box>
                        <Typography
                            sx={{
                                fontSize: "0.78rem",
                                color: C.textDim,
                                mt: 0.5,
                            }}
                        >
                            {info.meaning}
                        </Typography>
                        {info.causes.length > 0 && (
                            <>
                                <Typography
                                    sx={{
                                        ...eyebrow,
                                        fontSize: "0.56rem",
                                        mt: 1,
                                        mb: 0.3,
                                    }}
                                >
                                    Typical causes
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                    {info.causes.map((c) => (
                                        <Typography
                                            component="li"
                                            key={c}
                                            sx={{
                                                fontSize: "0.74rem",
                                                color: C.textDim,
                                            }}
                                        >
                                            {c}
                                        </Typography>
                                    ))}
                                </Box>
                            </>
                        )}
                        {info.fixes.length > 0 && (
                            <>
                                <Typography
                                    sx={{
                                        ...eyebrow,
                                        color: C.green,
                                        fontSize: "0.56rem",
                                        mt: 1,
                                        mb: 0.3,
                                    }}
                                >
                                    What to do
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                    {info.fixes.map((c) => (
                                        <Typography
                                            component="li"
                                            key={c}
                                            sx={{
                                                fontSize: "0.74rem",
                                                color: C.textDim,
                                            }}
                                        >
                                            {c}
                                        </Typography>
                                    ))}
                                </Box>
                            </>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
