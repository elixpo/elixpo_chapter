"use client";

/** Non-2xx request groups: search, sort, paginate, CSV export. */

import { C } from "@/components/ui";
import { type NonOkRow, requestSourceInfo } from "@/lib/diagnostics-core";
import { Box, InputBase, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
    CodeChip,
    PillButton,
    type SortDir,
    SortTh,
    TableBox,
    cmp,
    downloadCsv,
    nextSort,
    num,
} from "./shared";

const PER = 25;

const muted = (v: string) =>
    v === "unknown" || v === "" ? (
        <Box component="span" sx={{ color: C.borderLight }}>
            —
        </Box>
    ) : (
        v
    );

export default function RequestExplorer({
    rows,
    onCode,
    activeCodes,
}: {
    rows: NonOkRow[];
    onCode: (code: number) => void;
    activeCodes: number[];
}) {
    const [q, setQ] = useState("");
    const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
        key: "count",
        dir: "desc",
    });
    const [page, setPage] = useState(0);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const r = s
            ? rows.filter((x) =>
                  [
                      x.host,
                      x.status,
                      x.originStatus === 0 ? "no response" : x.originStatus,
                      x.cacheStatus,
                      x.securityAction,
                      x.securitySource,
                      x.requestSource,
                      x.method,
                      x.path,
                  ]
                      .join(" ")
                      .toLowerCase()
                      .includes(s),
              )
            : rows;
        const k = sort.key as keyof NonOkRow;
        return [...r].sort(
            (a, b) => cmp(a[k], b[k]) * (sort.dir === "asc" ? 1 : -1),
        );
    }, [rows, q, sort]);

    const pages = Math.max(1, Math.ceil(filtered.length / PER));
    const p = Math.min(page, pages - 1);
    const slice = filtered.slice(p * PER, p * PER + PER);
    const onSort = (k: string) => {
        setSort((s) => nextSort(s, k));
        setPage(0);
    };
    const total = filtered.reduce((a, r) => a + r.count, 0);

    const exportCsv = () =>
        downloadCsv("non-2xx-requests", [
            [
                "host",
                "status",
                "origin_status",
                "cache",
                "security_action",
                "security_source",
                "request_source",
                "method",
                "path",
                "count",
            ],
            ...filtered.map((r) => [
                r.host,
                r.status,
                r.originStatus === 0 ? "no response" : r.originStatus,
                r.cacheStatus,
                r.securityAction,
                r.securitySource,
                r.requestSource,
                r.method,
                r.path,
                r.count,
            ]),
        ]);

    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    px: { xs: 1.5, md: 2 },
                    py: 1.1,
                    borderBottom: `1px solid ${C.border}`,
                    flexWrap: "wrap",
                }}
            >
                <InputBase
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setPage(0);
                    }}
                    placeholder="Search host, path, status, cache, security, source…"
                    sx={{
                        flex: "1 1 240px",
                        fontSize: "0.8rem",
                        px: 1.5,
                        py: 0.3,
                        borderRadius: "999px",
                        bgcolor: C.paperDeep,
                    }}
                />
                <Typography
                    sx={{
                        fontFamily: C.mono,
                        fontSize: "0.68rem",
                        color: C.textMuted,
                    }}
                >
                    {num(filtered.length)} groups · {num(total)} req
                </Typography>
                <PillButton onClick={exportCsv} disabled={!filtered.length}>
                    CSV
                </PillButton>
            </Box>
            <TableBox minWidth={1100}>
                <thead>
                    <tr>
                        <SortTh
                            label="Host"
                            k="host"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Status"
                            k="status"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Origin"
                            k="originStatus"
                            sort={sort}
                            onSort={onSort}
                            title="What the origin answered; 'no response' = origin never answered"
                        />
                        <SortTh
                            label="Cache"
                            k="cacheStatus"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Security"
                            k="securityAction"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Source"
                            k="requestSource"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Method"
                            k="method"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Path"
                            k="path"
                            sort={sort}
                            onSort={onSort}
                        />
                        <SortTh
                            label="Requests"
                            k="count"
                            sort={sort}
                            onSort={onSort}
                            num
                        />
                    </tr>
                </thead>
                <tbody>
                    {slice.map((r, i) => {
                        const src = requestSourceInfo(r.requestSource);
                        return (
                            <tr key={`${p}-${i}`}>
                                <td
                                    style={{
                                        whiteSpace: "nowrap",
                                        fontWeight: 600,
                                    }}
                                >
                                    {r.host}
                                </td>
                                <td>
                                    <CodeChip
                                        code={r.status}
                                        onClick={() => onCode(r.status)}
                                        active={activeCodes.includes(r.status)}
                                    />
                                </td>
                                <td
                                    className="mono"
                                    style={{ whiteSpace: "nowrap" }}
                                >
                                    {r.originStatus === 0 ? (
                                        <Box
                                            component="span"
                                            sx={{ color: C.error }}
                                        >
                                            no response
                                        </Box>
                                    ) : (
                                        r.originStatus
                                    )}
                                </td>
                                <td className="mono">{muted(r.cacheStatus)}</td>
                                <td
                                    className="mono"
                                    style={{ whiteSpace: "nowrap" }}
                                >
                                    {r.securityAction === "unknown" ? (
                                        muted("")
                                    ) : (
                                        <Box
                                            component="span"
                                            sx={{
                                                color:
                                                    r.securityAction === "block"
                                                        ? C.error
                                                        : C.text,
                                            }}
                                        >
                                            {r.securityAction}
                                            <Box
                                                component="span"
                                                sx={{ color: C.textMuted }}
                                            >
                                                {" "}
                                                · {r.securitySource}
                                            </Box>
                                        </Box>
                                    )}
                                </td>
                                <td
                                    className="mono"
                                    style={{ whiteSpace: "nowrap" }}
                                    title={src.meaning}
                                >
                                    <Box
                                        component="span"
                                        sx={{
                                            color: src.visitor
                                                ? C.text
                                                : C.blue,
                                            borderBottom: src.visitor
                                                ? "none"
                                                : `1px dotted ${C.blue}`,
                                        }}
                                    >
                                        {src.visitor
                                            ? r.requestSource
                                            : src.label}
                                    </Box>
                                </td>
                                <td className="mono">{r.method}</td>
                                <td className="mono" title={r.path}>
                                    <Box
                                        sx={{
                                            maxWidth: 360,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {r.path}
                                    </Box>
                                </td>
                                <td className="num" style={{ fontWeight: 700 }}>
                                    {num(r.count)}
                                </td>
                            </tr>
                        );
                    })}
                    {!slice.length && (
                        <tr>
                            <td colSpan={9}>
                                <Typography
                                    sx={{
                                        textAlign: "center",
                                        color: C.textMuted,
                                        fontSize: "0.8rem",
                                        py: 2,
                                    }}
                                >
                                    No matching non-2xx requests.
                                </Typography>
                            </td>
                        </tr>
                    )}
                </tbody>
            </TableBox>
            {pages > 1 && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        px: { xs: 1.5, md: 2 },
                        py: 1,
                        borderTop: `1px solid ${C.border}`,
                    }}
                >
                    <Typography
                        sx={{
                            fontFamily: C.mono,
                            fontSize: "0.68rem",
                            color: C.textMuted,
                        }}
                    >
                        page {p + 1} / {pages}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.75 }}>
                        <PillButton
                            onClick={() => setPage(0)}
                            disabled={p === 0}
                        >
                            First
                        </PillButton>
                        <PillButton
                            onClick={() => setPage(p - 1)}
                            disabled={p === 0}
                        >
                            Prev
                        </PillButton>
                        <PillButton
                            onClick={() => setPage(p + 1)}
                            disabled={p >= pages - 1}
                        >
                            Next
                        </PillButton>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
