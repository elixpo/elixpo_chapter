"use client";

import { C, TopList, eyebrow } from "@/components/ui";
import type { Dim } from "@/lib/metrics";
import { Fullscreen } from "@mui/icons-material";
import { Box, Dialog, IconButton, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { useState } from "react";

const Globe = dynamic(() => import("@/components/globe"), { ssr: false });

export default function ExpandableGlobe({
    country,
    size = 300,
}: { country: Dim[]; size?: number }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Box sx={{ position: "relative" }}>
                <IconButton
                    size="small"
                    onClick={() => setOpen(true)}
                    title="Expand globe"
                    sx={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        zIndex: 2,
                        color: C.textMuted,
                        "&:hover": { color: C.ink },
                    }}
                >
                    <Fullscreen fontSize="small" />
                </IconButton>
                <Globe country={country} size={size} />
            </Box>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                maxWidth="md"
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: C.panel,
                            border: `1px solid ${C.border}`,
                            borderRadius: "22px",
                            boxShadow: "0 18px 48px rgba(20,32,24,.09)",
                            m: { xs: 1.5, sm: 4 },
                            width: { xs: "calc(100% - 24px)", sm: undefined },
                        },
                    },
                }}
            >
                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                    <Typography sx={{ ...eyebrow, mb: 0.75 }}>
                        Geography
                    </Typography>
                    <Typography
                        sx={{
                            color: C.text,
                            fontWeight: 650,
                            fontSize: "1.5rem",
                            letterSpacing: "-0.04em",
                            mb: 2,
                        }}
                    >
                        Requests by country
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" },
                            gap: 3,
                            alignItems: "center",
                        }}
                    >
                        <Globe country={country} size={440} />
                        <Box sx={{ maxHeight: 440, overflowY: "auto" }}>
                            <TopList
                                items={country.map((c) => ({
                                    label: c.label,
                                    value: c.count,
                                }))}
                            />
                        </Box>
                    </Box>
                </Box>
            </Dialog>
        </>
    );
}
