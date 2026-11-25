import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Fundraisers",
    description: "Start a fundraiser on Elixpo Pay: a public page with a goal, a QR code and UPI/card payments — and see exactly how the money reaches the creator.",
    alternates: { canonical: "/docs/fundraisers" },
    openGraph: { url: "/docs/fundraisers", title: "Fundraisers · Elixpo Pay docs", description: "Start a fundraiser on Elixpo Pay: a public page with a goal, a QR code and UPI/card payments — and see exactly how the money reaches the creator." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
