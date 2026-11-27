import type { Metadata } from "next";
import type React from "react";
import DocsShell from "./docs-shell";

export const runtime = "edge";

// Server layout so docs pages can carry real metadata; the interactive shell
// (nav, search, theme) lives in docs-shell.tsx.
export const metadata: Metadata = {
    title: { default: "Documentation", template: "%s · Docs | Elixpo Pay" },
    description:
        "Developer documentation for Elixpo Pay: checkout sessions, catalog sync, signed webhooks, entitlements, buyer emails, fundraisers and connected payouts.",
    alternates: { canonical: "/docs" },
    openGraph: { type: "website", siteName: "Elixpo Pay", url: "/docs", title: "Elixpo Pay documentation" },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return <DocsShell>{children}</DocsShell>;
}
