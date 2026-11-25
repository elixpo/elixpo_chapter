"use client";

import MetricChart from "@/components/metric-chart";
import {
    Grid,
    KV,
    Note,
    Pill,
    SectionTitle,
    pct,
} from "@/components/service/kit";
import {
    SSL_MEANING,
    settingValue,
    sslTone,
} from "@/components/service/settings";
import type { SecurityTabData, ServiceCtx } from "@/components/service/types";
import {
    C,
    Donut,
    KpiTile,
    Panel,
    SectionError,
    TopList,
    fmt,
} from "@/components/ui";
import { SECURITY_SOURCE_INFO } from "@/lib/diagnostics-core";
import { Box } from "@mui/material";

const PATHING: Record<string, string> = {
    "bic.ban.unknown":
        "Browser Integrity Check blocked a request with a suspicious / missing User-Agent",
    "macro.chl.captchaErr": "Visitor failed a challenge",
    "macro.chl.jschlErr": "Visitor failed a JS challenge",
    "user.ban.ip": "Blocked by an IP Access rule",
    "user.ban.ctry": "Blocked by a country Access rule",
    "hot.ban.unknown": "Hotlink Protection blocked an embed",
};

export default function SecurityTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: SecurityTabData }) {
    const sec = data.security.data;
    const th = data.threats.data;
    const s = data.settings;
    const n403 = sec.blocked.find((r) => r.label === "403")?.count || 0;
    const n429 = sec.blocked.find((r) => r.label === "429")?.count || 0;
    const mitigated = sec.action
        .filter((r) => !["unknown", "(none)", "allow", ""].includes(r.label))
        .reduce((a, r) => a + r.count, 0);
    const total4xx = sec.ip4xx.reduce((a, r) => a + r.count, 0);

    return (
        <Box>
            {!data.security.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Security analytics unavailable: ${data.security.error}`}
                    />
                </Box>
            )}
            <Grid min={170}>
                <KpiTile
                    label="403 Forbidden"
                    value={fmt(n403)}
                    sub={
                        data.total
                            ? `${pct(n403 / data.total, 2)} of requests`
                            : undefined
                    }
                    color={C.yellow}
                />
                <KpiTile
                    label="429 Rate limited"
                    value={fmt(n429)}
                    sub={
                        data.total
                            ? `${pct(n429 / data.total, 2)} of requests`
                            : undefined
                    }
                    color={C.yellow}
                />
                <KpiTile
                    label="Mitigated by Cloudflare"
                    value={fmt(mitigated)}
                    sub="securityAction ≠ allow / none"
                    color={C.orange}
                />
                <KpiTile
                    label="Zone threats"
                    value={fmt(th.total)}
                    sub={`zone-wide · ${th.requests ? pct(th.total / th.requests, 2) : "—"} of ${fmt(th.requests)}`}
                    color={C.orange}
                />
            </Grid>

            <SectionTitle note={`Scoped to ${ctx.service.host}.`}>
                This host
            </SectionTitle>
            <Grid cols={3}>
                <Panel title="Security action">
                    {sec.action.length ? (
                        <Donut
                            data={sec.action.slice(0, 6).map((r) => ({
                                label: r.label,
                                value: r.count,
                            }))}
                            size={130}
                        />
                    ) : (
                        <Box sx={{ fontSize: "0.8rem", color: C.textMuted }}>
                            No data.
                        </Box>
                    )}
                    <Note>
                        <b>unknown</b> means no security feature acted on the
                        request — the normal case.
                    </Note>
                </Panel>
                <Panel title="Security source" dense>
                    <TopList
                        items={sec.source.map((r) => ({
                            label:
                                r.label === "unknown" || r.label === "(none)"
                                    ? "none (not evaluated / passed)"
                                    : SECURITY_SOURCE_INFO[r.label]
                                      ? `${r.label} — ${SECURITY_SOURCE_INFO[r.label]}`
                                      : r.label,
                            value: r.count,
                        }))}
                        controls={false}
                    />
                </Panel>
                <Panel title="4xx paths" dense>
                    <TopList
                        items={sec.path4xx.map((r) => ({
                            label: r.label,
                            value: r.count,
                        }))}
                        color={C.yellow}
                        controls={false}
                    />
                </Panel>
                <Panel
                    title={`Client IPs hitting 4xx · ${fmt(total4xx)}`}
                    dense
                    exportData={sec.ip4xx.map((r) => ({
                        label: r.label,
                        value: r.count,
                    }))}
                >
                    <TopList
                        items={sec.ip4xx.map((r) => ({
                            label: r.label,
                            value: r.count,
                        }))}
                        color={C.orange}
                    />
                </Panel>
                <Panel title="Countries hitting 4xx" dense>
                    <TopList
                        items={sec.country4xx.map((r) => ({
                            label: r.label,
                            value: r.count,
                        }))}
                        color={C.orange}
                        controls={false}
                    />
                </Panel>
                <Panel title="Zone security settings (read-only)">
                    {s.available ? (
                        <KV
                            rows={[
                                {
                                    k: "Security level",
                                    v: settingValue(s.data.security_level),
                                },
                                {
                                    k: "SSL/TLS mode",
                                    v: (
                                        <Pill tone={sslTone(s.data.ssl)}>
                                            {String(s.data.ssl ?? "—")}
                                        </Pill>
                                    ),
                                    hint: SSL_MEANING[String(s.data.ssl)],
                                },
                                {
                                    k: "Minimum TLS",
                                    v: settingValue(s.data.min_tls_version),
                                },
                                {
                                    k: "Always use HTTPS",
                                    v: settingValue(s.data.always_use_https),
                                },
                                {
                                    k: "Automatic HTTPS rewrites",
                                    v: settingValue(
                                        s.data.automatic_https_rewrites,
                                    ),
                                },
                                {
                                    k: "TLS 1.3",
                                    v: settingValue(s.data.tls_1_3),
                                },
                                {
                                    k: "Browser Integrity Check",
                                    v: settingValue(s.data.browser_check),
                                },
                                {
                                    k: "HTTP/3 (QUIC)",
                                    v: settingValue(s.data.http3),
                                },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Zone settings unavailable: ${s.error}`}
                        />
                    )}
                </Panel>
            </Grid>

            <SectionTitle
                note={`Threat counters only exist zone-wide (${ctx.service.zoneName}) — Cloudflare does not split them by host. ${th.granularity === "day" ? "Daily buckets (hourly data is limited to 3 days)." : "Hourly buckets."}`}
            >
                Zone-wide threats
            </SectionTitle>
            {!data.threats.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`Threat data unavailable: ${data.threats.error}`}
                    />
                </Box>
            )}
            <Grid cols={3}>
                <Box
                    sx={{
                        gridColumn: { xs: "auto", lg: "span 2" },
                        minWidth: 0,
                    }}
                >
                    <Panel title="Threats over time (zone-wide)">
                        <MetricChart
                            points={th.points}
                            series={[
                                {
                                    key: "threats",
                                    label: "Threats",
                                    color: C.orange,
                                },
                            ]}
                        />
                    </Panel>
                </Box>
                <Panel title="Threat countries (zone-wide)" dense>
                    <TopList
                        items={th.countries.map((r) => ({
                            label: r.label,
                            value: r.count,
                        }))}
                        color={C.orange}
                        controls={false}
                    />
                </Panel>
                <Panel title="Threat types (zone-wide)" dense>
                    <TopList
                        items={th.pathing.map((r) => ({
                            label: PATHING[r.label]
                                ? `${r.label} — ${PATHING[r.label]}`
                                : r.label,
                            value: r.count,
                        }))}
                        color={C.orange}
                        controls={false}
                    />
                </Panel>
            </Grid>
            <Note>
                Firewall / WAF event logs (firewallEventsAdaptive) are not
                available on the Free plan, so individual blocked requests and
                rule IDs cannot be listed here — use Security → Events in the
                Cloudflare dashboard.
            </Note>
        </Box>
    );
}
