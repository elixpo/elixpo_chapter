"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useState } from "react";

/**
 * Change client_id (slug) dialog. Cautions that the vendor integration must be
 * updated, and that the OLD id keeps working for a backtrack window.
 */
export default function ChangeIdDialog({
    open,
    currentId,
    graceHours = 5,
    busy = false,
    error,
    onConfirm,
    onClose,
}: {
    open: boolean;
    currentId: string;
    graceHours?: number;
    busy?: boolean;
    error?: string;
    onConfirm: (next: string) => void;
    onClose: () => void;
}) {
    const [next, setNext] = useState("");
    const valid =
        /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(next.trim()) &&
        next.trim() !== currentId;

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="xs"
            PaperProps={{
                sx: {
                    bgcolor: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: "var(--radius-panel)",
                    color: "var(--app-fg)",
                    backgroundImage: "none",
                },
            }}
        >
            <DialogContent sx={{ pt: 3 }}>
                <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="flex-start"
                    sx={{ mb: 2 }}
                >
                    <Box
                        sx={{
                            flexShrink: 0,
                            width: 40,
                            height: 40,
                            borderRadius: "10px",
                            display: "grid",
                            placeItems: "center",
                            color: "var(--app-warn)",
                            background: "color-mix(in srgb, var(--app-warn) 10%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--app-warn) 25%, transparent)",
                        }}
                    >
                        <WarningAmberIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography
                            sx={{
                                fontWeight: 700,
                                fontSize: "1.1rem",
                                mb: 0.5,
                            }}
                        >
                            Change client ID?
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.88rem",
                                lineHeight: 1.6,
                            }}
                        >
                            Update the new ID in your app <strong>first</strong>
                            . The old ID <strong>{currentId}</strong> keeps
                            working for <strong>{graceHours} hours</strong> as a
                            backtrack window, then stops.
                        </Typography>
                    </Box>
                </Stack>

                <TextField
                    value={next}
                    onChange={(e) => setNext(e.target.value.toLowerCase())}
                    placeholder="new-client-id"
                    label="New client ID"
                    size="small"
                    fullWidth
                    autoFocus
                    sx={{
                        "& .MuiOutlinedInput-root": {
                            color: "var(--app-fg)",
                            background: "var(--app-overlay)",
                            "& fieldset": {
                                borderColor: "var(--app-border)",
                            },
                            "&:hover fieldset": {
                                borderColor: "color-mix(in srgb, var(--app-accent) 40%, transparent)",
                            },
                            "&.Mui-focused fieldset": {
                                borderColor: "var(--app-accent)",
                            },
                        },
                        "& .MuiInputLabel-root": {
                            color: "var(--app-fg-muted)",
                        },
                    }}
                />
                <Typography
                    sx={{
                        color: "var(--app-fg-faint)",
                        fontSize: "0.74rem",
                        mt: 0.8,
                    }}
                >
                    3–40 chars · lowercase letters, digits, hyphens · starts
                    with a letter.
                </Typography>
                {error && (
                    <Typography
                        sx={{ color: "var(--app-danger)", fontSize: "0.82rem", mt: 1 }}
                    >
                        {error}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button
                    onClick={onClose}
                    disabled={busy}
                    sx={{
                        textTransform: "none",
                        color: "var(--app-fg-muted)",
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={() => onConfirm(next.trim())}
                    disabled={busy || !valid}
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: "#fff",
                        px: 2.4,
                        borderRadius: "999px",
                        background:
                            "linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent) 100%)",
                        "&:hover": {
                            background:
                                "linear-gradient(135deg, var(--app-accent-2) 0%, var(--app-accent-2) 100%)",
                        },
                        "&.Mui-disabled": { opacity: 0.45, color: "#fff" },
                    }}
                >
                    {busy ? "Changing…" : "Change ID"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
