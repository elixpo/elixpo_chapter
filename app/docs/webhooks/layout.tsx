import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Webhooks",
    description: "Verify Elixpo Pay's HMAC-signed entitlement.updated and payment.captured webhooks, with secret rotation and dual signing.",
    alternates: { canonical: "/docs/webhooks" },
    openGraph: { url: "/docs/webhooks", title: "Webhooks · Elixpo Pay docs", description: "Verify Elixpo Pay's HMAC-signed entitlement.updated and payment.captured webhooks, with secret rotation and dual signing." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
