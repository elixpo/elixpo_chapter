"use client";

/** URL-driven time-range selector. Updates ?range= so server pages re-fetch. */

import { C } from "@/components/ui";
import { RANGES } from "@/lib/range";
import { Box } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TimeRange() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const current = params.get("range") || "24h";

    const set = (key: string) => {
        const p = new URLSearchParams(params.toString());
        p.set("range", key);
        router.push(`${pathname}?${p.toString()}`);
    };

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                p: 0.4,
                borderRadius: "999px",
                bgcolor: C.paper,
                border: `1px solid ${C.line}`,
                maxWidth: "100%",
                overflowX: "auto",
            }}
        >
            {RANGES.map((r) => {
                const active = current === r.key;
                return (
                    <Box
                        key={r.key}
                        component="button"
                        onClick={() => set(r.key)}
                        sx={{
                            border: "none",
                            cursor: "pointer",
                            px: 1.3,
                            py: 0.5,
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            fontFamily: C.mono,
                            whiteSpace: "nowrap",
                            color: active ? C.panel : C.textMuted,
                            bgcolor: active ? C.ink : "transparent",
                            transition: "background 0.15s, color 0.15s",
                            "&:hover": {
                                color: active ? C.panel : C.text,
                                bgcolor: active ? C.ink : C.paperDeep,
                            },
                        }}
                    >
                        {r.label}
                    </Box>
                );
            })}
        </Box>
    );
}
