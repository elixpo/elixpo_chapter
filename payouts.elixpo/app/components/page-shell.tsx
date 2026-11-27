"use client";

import type React from "react";
import BackgroundAurora from "./background-aurora";
import Footer from "./footer";
import Navbar from "./navbar";

/** Standard marketing/content shell: paper canvas, floating pill header, footer. */
export default function PageShell({
    children,
    variant = "default",
}: {
    children: React.ReactNode;
    variant?: "default" | "auth" | "warm" | "docs";
}) {
    return (
        <div style={{ position: "relative", minHeight: "100vh", color: "var(--app-fg)" }}>
            <BackgroundAurora variant={variant} />
            <div style={{ position: "relative", zIndex: 1 }}>
                <Navbar />
                <main id="main-content" tabIndex={-1}>
                    {children}
                </main>
                <Footer />
            </div>
        </div>
    );
}
