"use client";

import { C, KpiTile, PageHeader, fmt, trend } from "@/components/ui";
import { ArrowForward } from "@mui/icons-material";
import { Box } from "@mui/material";
import Link from "next/link";

export interface ProjItem {
    name: string;
    label: string;
    domain?: string;
    available: boolean;
    requests: number;
    spark: number[];
}

/** Custom (non *.pages.dev) domain → it has a per-service zone view. */
function serviceHost(domain?: string) {
    return domain && !domain.endsWith(".pages.dev") ? domain : null;
}

export default function ProjectsView({ projects }: { projects: ProjItem[] }) {
    return (
        <Box>
            <PageHeader
                title="Projects"
                subtitle="Every Cloudflare project, with its traffic. Click through for bindings & full monitoring."
                timeRange
            />
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fit, minmax(240px, 1fr))",
                    },
                    gap: 1.5,
                }}
            >
                {projects.map((p) => {
                    const host = serviceHost(p.domain);
                    return (
                        <Box
                            key={p.name}
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.75,
                                minWidth: 0,
                            }}
                        >
                            <Box sx={{ flex: 1 }}>
                                <KpiTile
                                    label={p.label}
                                    value={p.available ? fmt(p.requests) : "—"}
                                    sub={p.domain || p.name}
                                    spark={p.spark}
                                    delta={
                                        p.spark.length ? trend(p.spark) : null
                                    }
                                    href={`/dashboard/projects/${p.name}`}
                                />
                            </Box>
                            {host && (
                                <ServiceLink
                                    host={host}
                                    label="Service dashboard"
                                />
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

/** Small pill link to the per-service (zone-style) dashboard. */
export function ServiceLink({ host, label }: { host: string; label: string }) {
    return (
        <Box
            component={Link}
            href={`/dashboard/services/${encodeURIComponent(host)}`}
            sx={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.25,
                py: 0.45,
                borderRadius: "999px",
                border: `1px solid ${C.line}`,
                bgcolor: C.panel,
                color: C.green,
                fontSize: "0.74rem",
                fontWeight: 700,
                textDecoration: "none",
                transition: "background 0.15s, border-color 0.15s",
                "&:hover": { bgcolor: C.paperDeep, borderColor: C.ink },
            }}
        >
            {label}
            <ArrowForward sx={{ fontSize: "0.85rem" }} />
        </Box>
    );
}
