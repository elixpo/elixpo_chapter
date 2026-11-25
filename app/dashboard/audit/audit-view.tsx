"use client";

import {
    C,
    Empty,
    PageHeader,
    Panel,
    StatusChip,
    eyebrow,
} from "@/components/ui";
import type { AuditEntry } from "@/lib/audit";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from "@mui/material";

export default function AuditView({
    entries,
    error,
}: { entries: AuditEntry[]; error?: string | null }) {
    return (
        <Box>
            <PageHeader
                title="Audit log"
                subtitle="Every admin write action, newest first"
            />
            <Panel title={`${entries.length} entries`}>
                {error ? (
                    <Empty message={error} />
                ) : entries.length === 0 ? (
                    <Empty message="No admin actions recorded yet." />
                ) : (
                    <TableContainer sx={{ overflowX: "auto" }}>
                        <Table size="small" sx={{ minWidth: 560 }}>
                            <TableHead>
                                <TableRow>
                                    {["When", "Actor", "Action", "Target"].map(
                                        (h) => (
                                            <TableCell
                                                key={h}
                                                sx={{
                                                    ...eyebrow,
                                                    color: C.textMuted,
                                                    fontSize: "0.62rem",
                                                    bgcolor: C.paperDeep,
                                                    borderBottom: `1px solid ${C.line}`,
                                                }}
                                            >
                                                {h}
                                            </TableCell>
                                        ),
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {entries.map((e, i) => (
                                    <TableRow
                                        key={i}
                                        sx={{
                                            "&:hover": {
                                                bgcolor: C.panelHover,
                                            },
                                        }}
                                    >
                                        <TableCell
                                            sx={{
                                                color: C.textMuted,
                                                whiteSpace: "nowrap",
                                                fontSize: "0.78rem",
                                                borderBottom: `1px solid ${C.line}`,
                                            }}
                                        >
                                            {new Date(e.ts).toLocaleString()}
                                        </TableCell>
                                        <TableCell
                                            sx={{
                                                color: C.text,
                                                fontSize: "0.78rem",
                                                borderBottom: `1px solid ${C.line}`,
                                            }}
                                        >
                                            {e.actor}
                                        </TableCell>
                                        <TableCell
                                            sx={{
                                                borderBottom: `1px solid ${C.line}`,
                                            }}
                                        >
                                            <StatusChip
                                                label={e.action}
                                                tone="info"
                                            />
                                        </TableCell>
                                        <TableCell
                                            sx={{
                                                color: C.textDim,
                                                fontSize: "0.76rem",
                                                fontFamily: C.mono,
                                                overflowWrap: "anywhere",
                                                borderBottom: `1px solid ${C.line}`,
                                            }}
                                        >
                                            {e.target || "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Panel>
        </Box>
    );
}
