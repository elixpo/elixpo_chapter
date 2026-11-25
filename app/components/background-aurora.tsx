"use client";

import { Box } from "@mui/material";

/** Flat paper backdrop behind every route (research.elixpo has no glows;
 *  decorative geometry lives on the individual marketing/auth surfaces). */
const BackgroundAurora = () => {
    return (
        <Box
            aria-hidden
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                background: "var(--bg)",
            }}
        />
    );
};

export default BackgroundAurora;
