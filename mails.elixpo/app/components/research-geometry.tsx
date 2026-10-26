import { Box } from "@mui/material";

/** Decorative orbit + blob geometry from research.elixpo. Purely visual:
    absolutely positioned inside a `position: relative` parent. */
export default function ResearchGeometry({ label }: { label?: string }) {
    return (
        <Box
            aria-hidden
            sx={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
                zIndex: 0,
                "& i": { position: "absolute", display: "block" },
            }}
        >
            <Box
                component="i"
                sx={{
                    width: { xs: 300, md: 460 },
                    height: { xs: 300, md: 460 },
                    right: { xs: -170, md: -145 },
                    top: { xs: 40, md: 110 },
                    border: "1px solid color-mix(in srgb, var(--fg) 25%, transparent)",
                    borderRadius: "50%",
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        width: 14,
                        height: 14,
                        left: 42,
                        top: 55,
                        borderRadius: "50%",
                        background: "var(--geo-blue)",
                    },
                }}
            />
            <Box
                component="i"
                sx={{
                    width: 260,
                    height: 260,
                    left: -110,
                    bottom: -110,
                    border: "1px solid color-mix(in srgb, var(--fg) 25%, transparent)",
                    borderRadius: "50%",
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        width: 14,
                        height: 14,
                        right: 27,
                        top: 28,
                        borderRadius: "50%",
                        background: "var(--orange)",
                    },
                }}
            />
            <Box
                component="i"
                sx={{
                    display: { xs: "none", md: "block" },
                    width: 150,
                    height: 150,
                    right: "12%",
                    top: "22%",
                    borderRadius: "45% 55% 66% 34%",
                    background: "var(--geo-yellow)",
                    transform: "rotate(13deg)",
                    boxShadow: "0 28px 80px rgba(20,32,24,.14)",
                }}
            />
            <Box
                component="i"
                sx={{
                    display: { xs: "none", md: "block" },
                    width: 78,
                    height: 240,
                    left: "16%",
                    top: "18%",
                    border: "1px solid color-mix(in srgb, var(--fg) 22%, transparent)",
                    borderRadius: 999,
                    background: "color-mix(in srgb, var(--blue-wash) 55%, transparent)",
                    transform: "rotate(42deg)",
                }}
            />
            {label && (
                <Box
                    component="i"
                    sx={{
                        display: { xs: "none", lg: "grid" },
                        placeItems: "center",
                        width: 190,
                        height: 108,
                        right: "24%",
                        bottom: "14%",
                        border: "1px solid var(--border)",
                        borderRadius: "0.35rem",
                        background: "var(--surface)",
                        transform: "rotate(6deg)",
                        color: "var(--accent)",
                        font: "700 .68rem ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontStyle: "normal",
                        letterSpacing: ".14em",
                    }}
                >
                    {label}
                </Box>
            )}
        </Box>
    );
}
