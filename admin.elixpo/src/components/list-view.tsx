"use client";

import { C, Empty, PageHeader, Panel, StatusChip } from "@/components/ui";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";

export interface ListItem {
    id: string;
    primary: string;
    secondary?: string;
    href?: string;
    chip?: {
        label: string;
        tone: "success" | "warning" | "error" | "info" | "neutral";
    };
}

export default function ListView({
    title,
    subtitle,
    panelTitle,
    items,
    emptyMessage,
    error,
    children,
}: {
    title: string;
    subtitle?: string;
    panelTitle?: string;
    items: ListItem[];
    emptyMessage: string;
    error?: string | null;
    children?: React.ReactNode;
}) {
    return (
        <Box>
            <PageHeader title={title} subtitle={subtitle} />
            {children}
            <Panel title={panelTitle || `${items.length} total`}>
                {error ? (
                    <Empty message={error} />
                ) : items.length === 0 ? (
                    <Empty message={emptyMessage} />
                ) : (
                    items.map((it) => {
                        const row = (
                            <Box
                                key={it.id}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 1,
                                    py: 1.1,
                                    px: 1,
                                    borderRadius: "10px",
                                    borderBottom: `1px solid ${C.line}`,
                                    transition: "background 0.15s",
                                    "&:hover": it.href
                                        ? { bgcolor: C.paperDeep }
                                        : undefined,
                                }}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography
                                        sx={{
                                            color: C.text,
                                            fontSize: "0.9rem",
                                            fontWeight: 600,
                                            letterSpacing: "-0.01em",
                                        }}
                                    >
                                        {it.primary}
                                    </Typography>
                                    {it.secondary && (
                                        <Typography
                                            sx={{
                                                color: C.textMuted,
                                                fontSize: "0.74rem",
                                                fontFamily: C.mono,
                                                overflowWrap: "anywhere",
                                            }}
                                        >
                                            {it.secondary}
                                        </Typography>
                                    )}
                                </Box>
                                {it.chip && (
                                    <StatusChip
                                        label={it.chip.label}
                                        tone={it.chip.tone}
                                    />
                                )}
                            </Box>
                        );
                        return it.href ? (
                            <Link
                                key={it.id}
                                href={it.href}
                                style={{ textDecoration: "none" }}
                            >
                                {row}
                            </Link>
                        ) : (
                            <Box key={it.id}>{row}</Box>
                        );
                    })
                )}
            </Panel>
        </Box>
    );
}
