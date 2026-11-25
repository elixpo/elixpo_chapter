import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Entitlements API",
    description: "Read a customer's current tier, status and expiry from Elixpo Pay's server-to-server entitlements API.",
    alternates: { canonical: "/docs/entitlements" },
    openGraph: { url: "/docs/entitlements", title: "Entitlements API · Elixpo Pay docs", description: "Read a customer's current tier, status and expiry from Elixpo Pay's server-to-server entitlements API." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
