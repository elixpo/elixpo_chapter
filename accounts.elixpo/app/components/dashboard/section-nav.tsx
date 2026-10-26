"use client";

import { Box } from "@mui/material";
import type React from "react";
import { useEffect, useState } from "react";

export interface NavSection {
    id: string;
    label: string;
    /** Optional right-aligned status shown in the desktop sidebar. */
    status?: string;
    needsAttention?: boolean;
}

/**
 * Distance from the viewport top to where section content starts: the
 * floating app bar plus the page's own sticky header. Used for sticky
 * offsets, scroll-margin, and the scroll-spy trigger line.
 */
export const SECTION_SCROLL_OFFSET = { xs: 140, md: 190 } as const;

function currentOffset() {
    return typeof window !== "undefined" && window.innerWidth >= 900
        ? SECTION_SCROLL_OFFSET.md
        : SECTION_SCROLL_OFFSET.xs;
}

/**
 * Tracks which section is under the trigger line just below the sticky
 * chrome. The dashboard scrolls the window, so the observer root is the
 * viewport and this works the same on mobile and desktop. Pass `ready`
 * once the sections are rendered (e.g. after data loads).
 */
export function useScrollSpy(ids: readonly string[], ready = true): string {
    const [activeId, setActiveId] = useState(ids[0] ?? "");
    const key = ids.join("|");

    useEffect(() => {
        if (!ready) return;
        const sectionIds = key ? key.split("|") : [];
        const visible = new Set<string>();
        const offset = currentOffset();

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) visible.add(entry.target.id);
                    else visible.delete(entry.target.id);
                }
                // Bottom of the page: the last section may never reach the
                // trigger line, so select it once the user can't scroll further.
                const atBottom =
                    window.innerHeight + window.scrollY >=
                    document.documentElement.scrollHeight - 4;
                const next = atBottom
                    ? sectionIds[sectionIds.length - 1]
                    : sectionIds.find((id) => visible.has(id));
                if (next) setActiveId(next);
            },
            // A thin band just under the sticky chrome.
            { rootMargin: `-${offset}px 0px -60% 0px`, threshold: 0 },
        );

        for (const id of sectionIds) {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        }
        return () => observer.disconnect();
    }, [key, ready]);

    return activeId;
}

function scrollToSection(event: React.MouseEvent, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    // scroll-margin-top on the section accounts for the sticky chrome.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
}

/** Desktop sidebar list. Hidden below `lg`. */
export function SectionSidebar({
    sections,
    activeId,
    label,
    sx,
}: {
    sections: NavSection[];
    activeId: string;
    label: string;
    sx?: object;
}) {
    return (
        <Box
            component="nav"
            aria-label={label}
            sx={{
                display: { xs: "none", lg: "flex" },
                position: "sticky",
                top: SECTION_SCROLL_OFFSET.md - 10,
                flexDirection: "column",
                gap: 0.25,
                p: 1,
                borderRadius: "18px",
                border: "1px solid var(--border)",
                bgcolor: "var(--surface)",
                ...sx,
            }}
        >
            {sections.map((section) => {
                const active = section.id === activeId;
                return (
                    <Box
                        key={section.id}
                        component="a"
                        href={`#${section.id}`}
                        aria-current={active ? "location" : undefined}
                        onClick={(event: React.MouseEvent) =>
                            scrollToSection(event, section.id)
                        }
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 1,
                            borderRadius: "999px",
                            color: active ? "var(--cta-fg)" : "var(--fg-muted)",
                            bgcolor: active ? "var(--cta-bg)" : "transparent",
                            fontSize: "0.82rem",
                            fontWeight: active ? 700 : 500,
                            textDecoration: "none",
                            transition:
                                "background 0.15s ease, color 0.15s ease",
                            "&:hover": active
                                ? undefined
                                : {
                                      bgcolor: "var(--overlay)",
                                      color: "var(--fg)",
                                  },
                        }}
                    >
                        <span>{section.label}</span>
                        {section.status && (
                            <Box
                                component="span"
                                sx={{
                                    color: active
                                        ? "var(--cta-fg)"
                                        : section.needsAttention
                                          ? "#b45309"
                                          : "var(--fg-faint)",
                                    opacity: active ? 0.75 : 1,
                                    fontSize: "0.62rem",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {section.status}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/** Mobile horizontal pill bar. Sticky under the app bar; hidden from `lg`. */
export function SectionPills({
    sections,
    activeId,
    label,
    sx,
}: {
    sections: NavSection[];
    activeId: string;
    label: string;
    sx?: object;
}) {
    useEffect(() => {
        // Keep the active pill visible as the page scrolls.
        document
            .querySelector(`[data-section-pill="${activeId}"]`)
            ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeId]);

    return (
        <Box
            component="nav"
            aria-label={label}
            sx={{
                display: { xs: "flex", lg: "none" },
                position: "sticky",
                top: { xs: 76, md: 92 },
                zIndex: 9,
                gap: 0.75,
                overflowX: "auto",
                mx: { xs: -1, sm: 0 },
                px: { xs: 1, sm: 0 },
                py: 1,
                bgcolor: "color-mix(in srgb, var(--bg) 90%, transparent)",
                backdropFilter: "blur(12px)",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": { display: "none" },
                ...sx,
            }}
        >
            {sections.map((section) => {
                const active = section.id === activeId;
                return (
                    <Box
                        key={section.id}
                        component="a"
                        href={`#${section.id}`}
                        data-section-pill={section.id}
                        aria-current={active ? "location" : undefined}
                        onClick={(event: React.MouseEvent) =>
                            scrollToSection(event, section.id)
                        }
                        sx={{
                            flexShrink: 0,
                            px: 1.75,
                            py: 0.75,
                            borderRadius: "999px",
                            border: "1px solid",
                            borderColor: active
                                ? "var(--cta-bg)"
                                : "var(--border)",
                            bgcolor: active
                                ? "var(--cta-bg)"
                                : "var(--surface)",
                            color: active ? "var(--cta-fg)" : "var(--fg-muted)",
                            fontSize: "0.8rem",
                            fontWeight: active ? 700 : 500,
                            whiteSpace: "nowrap",
                            textDecoration: "none",
                        }}
                    >
                        {section.label}
                        {section.needsAttention && !active && (
                            <Box
                                component="span"
                                aria-label="needs attention"
                                sx={{
                                    display: "inline-block",
                                    width: 6,
                                    height: 6,
                                    ml: 0.75,
                                    mb: "1px",
                                    borderRadius: "50%",
                                    bgcolor: "#b45309",
                                }}
                            />
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/** Spread into a section's `sx` so anchor jumps land below the sticky chrome. */
export const sectionAnchorSx = {
    scrollMarginTop: {
        xs: `${SECTION_SCROLL_OFFSET.xs}px`,
        md: `${SECTION_SCROLL_OFFSET.md}px`,
    },
} as const;
