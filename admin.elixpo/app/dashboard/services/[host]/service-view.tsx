"use client";

import AnalyticsTab from "@/components/service/analytics-tab";
import CacheTab from "@/components/service/cache-tab";
import DnsTab from "@/components/service/dns-tab";
import FunctionsTab from "@/components/service/functions-tab";
import ServiceHero from "@/components/service/hero";
import { TextLink } from "@/components/service/kit";
import OverviewTab from "@/components/service/overview-tab";
import PerformanceTab from "@/components/service/performance-tab";
import SecurityTab from "@/components/service/security-tab";
import StatusTab from "@/components/service/status-tab";
import type { ServiceCtx, Tab, TabData } from "@/components/service/types";
import { C, Empty, PageHeader, glass } from "@/components/ui";
import { Box } from "@mui/material";

export default function ServiceView({
    ctx,
    host,
    tab,
    data,
}: {
    ctx: ServiceCtx | null;
    host: string;
    tab: Tab;
    data: TabData | null;
}) {
    if (!ctx || !data) {
        return (
            <Box>
                <PageHeader title={host} subtitle="Unknown service" />
                <Box sx={{ ...glass, p: 3, textAlign: "center" }}>
                    <Empty
                        message={`${host} is not served by any zone on this Cloudflare account.`}
                    />
                    <Box sx={{ fontSize: "0.85rem", color: C.textMuted }}>
                        <TextLink href="/dashboard/services">
                            ← All services
                        </TextLink>
                    </Box>
                </Box>
            </Box>
        );
    }
    return (
        <Box sx={{ minWidth: 0 }}>
            <ServiceHero ctx={ctx} tab={tab} />
            {data.tab === "overview" && <OverviewTab ctx={ctx} data={data} />}
            {data.tab === "analytics" && <AnalyticsTab ctx={ctx} data={data} />}
            {data.tab === "status" && <StatusTab ctx={ctx} data={data} />}
            {data.tab === "performance" && (
                <PerformanceTab ctx={ctx} data={data} />
            )}
            {data.tab === "cache" && <CacheTab ctx={ctx} data={data} />}
            {data.tab === "security" && <SecurityTab ctx={ctx} data={data} />}
            {data.tab === "functions" && <FunctionsTab ctx={ctx} data={data} />}
            {data.tab === "dns" && <DnsTab ctx={ctx} data={data} />}
        </Box>
    );
}
