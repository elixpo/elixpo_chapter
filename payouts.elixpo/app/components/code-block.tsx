"use client";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useState } from "react";

export default function CodeBlock({
    code,
    language = "",
}: {
    code: string;
    language?: string;
}) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            // ignore
        }
    };

    return (
        <Box
            sx={{
                position: "relative",
                my: 2.5,
                borderRadius: "12px",
                border: "1px solid color-mix(in srgb, var(--app-fg) 10%, transparent)",
                background: "var(--app-ink)",
                overflow: "hidden",
            }}
        >
            {language && (
                <Box
                    sx={{
                        px: 2,
                        py: 0.8,
                        borderBottom: "1px solid color-mix(in srgb, var(--app-fg) 6%, transparent)",
                        fontSize: "0.72rem",
                        letterSpacing: "0.14em", fontFamily: "var(--font-geist-mono)",
                        textTransform: "uppercase",
                        color: "var(--app-on-ink-muted)",
                    }}
                >
                    {language}
                </Box>
            )}
            <Tooltip title={copied ? "Copied!" : "Copy"} arrow>
                <IconButton
                    onClick={copy}
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        color: copied ? "var(--app-success)" : "var(--app-on-ink-muted)",
                        "&:hover": {
                            color: "var(--app-on-ink)",
                            background: "color-mix(in srgb, var(--app-fg) 6%, transparent)",
                        },
                    }}
                >
                    {copied ? (
                        <CheckIcon sx={{ fontSize: 16 }} />
                    ) : (
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                    )}
                </IconButton>
            </Tooltip>
            <Box
                component="pre"
                sx={{
                    m: 0,
                    p: 2,
                    overflowX: "auto",
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.82rem",
                    lineHeight: 1.65,
                    color: "var(--app-on-ink)",
                }}
            >
                <code>{code}</code>
            </Box>
        </Box>
    );
}
