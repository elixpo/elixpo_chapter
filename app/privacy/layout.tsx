import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description:
        "What Elixpo Pay collects from buyers, fundraiser contributors and creators, who processes it (Razorpay, Elixpo Mails, Cloudflare), and what we never store — no card numbers, UPI PINs or full bank account numbers.",
    alternates: { canonical: "/privacy" },
    openGraph: {
        title: "Privacy Policy | Elixpo Pay",
        description:
            "How Elixpo Pay handles your data across payments and payouts.",
        url: "https://payouts.elixpo.com/privacy",
    },
};

export default function PrivacyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
