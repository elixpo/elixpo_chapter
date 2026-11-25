"use client";

/**
 * Filter pills for the diagnostics dashboard: multi-select dropdowns (with
 * optional search), boolean toggles and a reset pill. Pure presentation —
 * state lives in the view and is mirrored to the URL there.
 */

import { C, eyebrow } from "@/components/ui";
import {
    Check,
    Close,
    KeyboardArrowDown,
    Search as SearchIcon,
} from "@mui/icons-material";
import { Box, InputBase, Menu, MenuItem, Typography } from "@mui/material";
import type React from "react";
import { useMemo, useState } from "react";

export interface Option<V extends string | number> {
    value: V;
    label: string;
    /** Secondary text on the right (e.g. a count). */
    hint?: string;
    /** Group heading this option belongs to. */
    group?: string;
    color?: string;
}

const pillSx = (active: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 0.6,
    pl: 1.4,
    pr: 0.9,
    py: 0.55,
    borderRadius: "999px",
    border: `1px solid ${active ? C.ink : C.line}`,
    bgcolor: active ? C.ink : C.panel,
    color: active ? "#fff" : C.text,
    fontSize: "0.76rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    maxWidth: 260,
    transition: "border-color .15s, background .15s",
    "&:hover": { borderColor: C.ink, bgcolor: active ? C.ink : C.paperDeep },
});

export function PillMulti<V extends string | number>({
    label,
    allLabel,
    options,
    value,
    onChange,
    searchable,
}: {
    label: string;
    /** Text when nothing is selected, e.g. "All services". */
    allLabel: string;
    options: Option<V>[];
    value: V[];
    onChange: (v: V[]) => void;
    searchable?: boolean;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [q, setQ] = useState("");
    const active = value.length > 0;
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s
            ? options.filter(
                  (o) =>
                      o.label.toLowerCase().includes(s) ||
                      String(o.value).toLowerCase().includes(s),
              )
            : options;
    }, [options, q]);

    const summary = !active
        ? allLabel
        : value.length === 1
          ? (options.find((o) => o.value === value[0])?.label ??
            String(value[0]))
          : `${value.length} selected`;

    const toggle = (v: V) =>
        onChange(
            value.includes(v) ? value.filter((x) => x !== v) : [...value, v],
        );

    let lastGroup: string | undefined;
    const items: React.ReactNode[] = [];
    for (const o of shown) {
        if (o.group && o.group !== lastGroup) {
            lastGroup = o.group;
            items.push(
                <Typography
                    key={`g:${o.group}`}
                    sx={{
                        ...eyebrow,
                        color: C.textMuted,
                        fontSize: "0.58rem",
                        px: 1.75,
                        pt: 1.25,
                        pb: 0.5,
                    }}
                >
                    {o.group}
                </Typography>,
            );
        }
        const on = value.includes(o.value);
        items.push(
            <MenuItem
                key={String(o.value)}
                onClick={() => toggle(o.value)}
                dense
                sx={{
                    gap: 1,
                    fontSize: "0.8rem",
                    py: 0.6,
                    color: C.text,
                    "&:hover": { bgcolor: C.paperDeep },
                }}
            >
                <Box
                    sx={{
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        borderRadius: "5px",
                        border: `1px solid ${on ? C.ink : C.borderLight}`,
                        bgcolor: on ? C.ink : "transparent",
                        display: "grid",
                        placeItems: "center",
                    }}
                >
                    {on && (
                        <Check sx={{ fontSize: "0.75rem", color: "#fff" }} />
                    )}
                </Box>
                {o.color && (
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: o.color,
                            flexShrink: 0,
                        }}
                    />
                )}
                <Box
                    component="span"
                    sx={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {o.label}
                </Box>
                {o.hint && (
                    <Box
                        component="span"
                        sx={{
                            fontFamily: C.mono,
                            fontSize: "0.68rem",
                            color: C.textMuted,
                        }}
                    >
                        {o.hint}
                    </Box>
                )}
            </MenuItem>,
        );
    }

    return (
        <>
            <Box
                component="button"
                onClick={(e: React.MouseEvent<HTMLElement>) =>
                    setAnchor(e.currentTarget)
                }
                sx={pillSx(active)}
            >
                <Box
                    component="span"
                    sx={{
                        fontFamily: C.mono,
                        fontSize: "0.6rem",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        opacity: 0.65,
                    }}
                >
                    {label}
                </Box>
                <Box
                    component="span"
                    sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
                >
                    {summary}
                </Box>
                <KeyboardArrowDown sx={{ fontSize: "1rem", opacity: 0.7 }} />
            </Box>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => {
                    setAnchor(null);
                    setQ("");
                }}
                autoFocus={!searchable}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 0.75,
                            bgcolor: C.panel,
                            border: `1px solid ${C.border}`,
                            borderRadius: "16px",
                            boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                            minWidth: 240,
                            maxWidth: "calc(100vw - 32px)",
                            maxHeight: 420,
                        },
                    },
                    list: { sx: { py: 0.5 } },
                }}
            >
                {searchable && (
                    <Box
                        sx={{ px: 1, pt: 0.5, pb: 0.75 }}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                px: 1,
                                py: 0.25,
                                borderRadius: "999px",
                                bgcolor: C.paperDeep,
                            }}
                        >
                            <SearchIcon
                                sx={{ fontSize: "0.95rem", color: C.textMuted }}
                            />
                            <InputBase
                                autoFocus
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={`Search ${label.toLowerCase()}…`}
                                sx={{ flex: 1, fontSize: "0.8rem" }}
                            />
                        </Box>
                    </Box>
                )}
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        px: 1.75,
                        py: 0.4,
                    }}
                >
                    <Box
                        component="button"
                        onClick={() => onChange([])}
                        sx={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: "0.72rem",
                            color: C.green,
                            fontWeight: 600,
                        }}
                    >
                        {allLabel}
                    </Box>
                    {shown.length > 1 && (
                        <Box
                            component="button"
                            onClick={() =>
                                onChange(
                                    Array.from(
                                        new Set([
                                            ...value,
                                            ...shown.map((o) => o.value),
                                        ]),
                                    ),
                                )
                            }
                            sx={{
                                all: "unset",
                                cursor: "pointer",
                                fontSize: "0.72rem",
                                color: C.textMuted,
                            }}
                        >
                            Select {q ? "matches" : "all"}
                        </Box>
                    )}
                </Box>
                {items.length ? (
                    items
                ) : (
                    <Typography
                        sx={{
                            px: 2,
                            py: 1,
                            fontSize: "0.78rem",
                            color: C.textMuted,
                        }}
                    >
                        No matches
                    </Typography>
                )}
            </Menu>
        </>
    );
}

export function PillToggle({
    label,
    on,
    onChange,
    title,
}: {
    label: string;
    on: boolean;
    onChange: (v: boolean) => void;
    title?: string;
}) {
    return (
        <Box
            component="button"
            onClick={() => onChange(!on)}
            title={title}
            aria-pressed={on}
            sx={pillSx(on)}
        >
            <Box
                component="span"
                sx={{
                    width: 26,
                    height: 15,
                    borderRadius: "999px",
                    bgcolor: on ? "#fff" : C.line,
                    position: "relative",
                    flexShrink: 0,
                    transition: "background .15s",
                }}
            >
                <Box
                    component="span"
                    sx={{
                        position: "absolute",
                        top: 2,
                        left: on ? 13 : 2,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        bgcolor: on ? C.ink : "#fff",
                        transition: "left .15s",
                    }}
                />
            </Box>
            {label}
        </Box>
    );
}

export function ResetPill({
    onClick,
    disabled,
}: {
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <Box
            component="button"
            onClick={onClick}
            disabled={disabled}
            sx={{
                ...pillSx(false),
                pr: 1.2,
                opacity: disabled ? 0.45 : 1,
                cursor: disabled ? "default" : "pointer",
            }}
        >
            <Close sx={{ fontSize: "0.9rem" }} />
            Reset
        </Box>
    );
}
