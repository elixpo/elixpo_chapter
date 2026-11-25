import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Quickstart",
    description: "Take your first payment with Elixpo Pay in minutes: register an app, sync a price, create a checkout session and verify the webhook.",
    alternates: { canonical: "/docs/quickstart" },
    openGraph: { url: "/docs/quickstart", title: "Quickstart · Elixpo Pay docs", description: "Take your first payment with Elixpo Pay in minutes: register an app, sync a price, create a checkout session and verify the webhook." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
