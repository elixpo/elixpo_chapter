"use client";

import {
    DataTable,
    Grid,
    KV,
    Note,
    Pill,
    TextLink,
    fmtTs,
} from "@/components/service/kit";
import {
    SSL_MEANING,
    settingValue,
    sslTone,
} from "@/components/service/settings";
import type { DnsTabData, ServiceCtx } from "@/components/service/types";
import { C, Donut, Panel, SectionError, fmt } from "@/components/ui";
import { Box } from "@mui/material";

export default function DnsTab({
    ctx,
    data,
}: { ctx: ServiceCtx; data: DnsTabData }) {
    const d = data.dns.data;
    const s = data.settings;
    const svc = ctx.service;
    const byType = new Map<string, number>();
    const byRcode = new Map<string, number>();
    for (const q of d.queries) {
        byType.set(q.queryType, (byType.get(q.queryType) || 0) + q.count);
        byRcode.set(
            q.responseCode,
            (byRcode.get(q.responseCode) || 0) + q.count,
        );
    }
    const totalQ = d.queries.reduce((a, q) => a + q.count, 0);
    const pagesDomains = data.pages?.domains || [];

    return (
        <Box>
            {!data.dns.available && (
                <Box sx={{ mb: 1.5 }}>
                    <SectionError
                        message={`DNS data unavailable: ${data.dns.error}`}
                    />
                </Box>
            )}
            <Panel title={`DNS records for ${svc.host}`} dense>
                <DataTable
                    rows={d.records}
                    empty="No DNS record with this exact name (it may be answered by a wildcard record or a Worker custom domain)."
                    cols={[
                        {
                            key: "type",
                            label: "Type",
                            render: (r) => (
                                <Pill tone="blue" mono>
                                    {r.type}
                                </Pill>
                            ),
                        },
                        { key: "name", label: "Name", mono: true },
                        {
                            key: "content",
                            label: "Content",
                            render: (r) => (
                                <Box
                                    component="span"
                                    sx={{
                                        fontFamily: C.mono,
                                        fontSize: "0.74rem",
                                        wordBreak: "break-all",
                                    }}
                                >
                                    {r.content}
                                </Box>
                            ),
                        },
                        {
                            key: "proxied",
                            label: "Proxy",
                            render: (r) =>
                                r.proxied ? (
                                    <Pill tone="green">Proxied</Pill>
                                ) : (
                                    <Pill tone="warn">DNS only</Pill>
                                ),
                        },
                        {
                            key: "ttl",
                            label: "TTL",
                            mono: true,
                            render: (r) =>
                                r.ttl === 1 ? "auto" : String(r.ttl ?? "—"),
                        },
                        {
                            key: "modified_on",
                            label: "Modified",
                            mono: true,
                            render: (r) =>
                                r.modified_on ? fmtTs(r.modified_on) : "—",
                        },
                    ]}
                />
            </Panel>
            <Box sx={{ mb: 2 }} />

            <Grid cols={3}>
                <Panel title="Attached compute">
                    <KV
                        rows={[
                            ...d.workerDomains.map((w) => ({
                                k: "Worker custom domain",
                                v: (
                                    <TextLink href="/dashboard/workers">
                                        {w.service}
                                        {w.environment
                                            ? ` (${w.environment})`
                                            : ""}
                                    </TextLink>
                                ),
                            })),
                            ...d.workerRoutes.map((r) => ({
                                k: `Route ${r.pattern}`,
                                v: r.script ? (
                                    <TextLink href="/dashboard/workers">
                                        {r.script}
                                    </TextLink>
                                ) : (
                                    "no script (bypass)"
                                ),
                            })),
                            ...(svc.pagesProject
                                ? [
                                      {
                                          k: "Pages project",
                                          v: (
                                              <TextLink
                                                  href={`/dashboard/projects/${svc.pagesProject}`}
                                              >
                                                  {svc.pagesProject}
                                              </TextLink>
                                          ),
                                      },
                                  ]
                                : []),
                        ]}
                    />
                    {!d.workerDomains.length &&
                        !d.workerRoutes.length &&
                        !svc.pagesProject && (
                            <Box
                                sx={{ fontSize: "0.8rem", color: C.textMuted }}
                            >
                                No Worker route, Worker custom domain or Pages
                                project is attached to this host.
                            </Box>
                        )}
                </Panel>
                <Panel title="Pages project domains">
                    {pagesDomains.length ? (
                        <Box
                            sx={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 0.75,
                            }}
                        >
                            {pagesDomains.map((dm) => (
                                <Pill
                                    key={dm}
                                    tone={
                                        dm === svc.host
                                            ? "ink"
                                            : dm.endsWith(".pages.dev")
                                              ? "neutral"
                                              : "blue"
                                    }
                                    mono
                                >
                                    {dm}
                                </Pill>
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ fontSize: "0.8rem", color: C.textMuted }}>
                            {svc.pagesProject
                                ? "Pages project detail unavailable."
                                : "Not a Pages host."}
                        </Box>
                    )}
                </Panel>
                <Panel title="Edge TLS (zone)">
                    {s.available ? (
                        <KV
                            rows={[
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
                                    k: "Always use HTTPS",
                                    v: settingValue(s.data.always_use_https),
                                },
                                {
                                    k: "Minimum TLS",
                                    v: settingValue(s.data.min_tls_version),
                                },
                                { k: "IPv6", v: settingValue(s.data.ipv6) },
                            ]}
                        />
                    ) : (
                        <SectionError
                            message={`Zone settings unavailable: ${s.error}`}
                        />
                    )}
                </Panel>
            </Grid>

            <Grid cols={2}>
                <Panel
                    title={`DNS queries for ${svc.host} · ${ctx.rangeLabel} · ${fmt(totalQ)}`}
                >
                    {d.queriesError ? (
                        <SectionError
                            message={`DNS analytics unavailable: ${d.queriesError}`}
                        />
                    ) : totalQ ? (
                        <Donut
                            data={Array.from(byType, ([label, value]) => ({
                                label,
                                value,
                            }))
                                .sort((a, b) => b.value - a.value)
                                .slice(0, 6)}
                            size={130}
                        />
                    ) : (
                        <Box sx={{ fontSize: "0.8rem", color: C.textMuted }}>
                            No authoritative DNS queries for this exact name.
                        </Box>
                    )}
                </Panel>
                <Panel title="DNS response codes">
                    {totalQ ? (
                        <KV
                            rows={Array.from(byRcode, ([k, v]) => ({
                                k,
                                v: `${fmt(v)} · ${((v / totalQ) * 100).toFixed(1)}%`,
                                hint:
                                    k === "NOERROR"
                                        ? "Answered normally"
                                        : k === "NXDOMAIN"
                                          ? "Name does not exist"
                                          : k === "SERVFAIL"
                                            ? "Resolver failure"
                                            : undefined,
                            }))}
                        />
                    ) : (
                        <Box sx={{ fontSize: "0.8rem", color: C.textMuted }}>
                            No data.
                        </Box>
                    )}
                    <Note>
                        Counts are queries to Cloudflare's authoritative
                        nameservers (resolvers cache, so this is far below HTTP
                        traffic).
                    </Note>
                </Panel>
            </Grid>
        </Box>
    );
}
