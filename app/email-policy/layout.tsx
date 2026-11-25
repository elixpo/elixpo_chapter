import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Email policy",
    description:
        "Which emails Elixpo Pay sends — only transactional receipts and account notices, never marketing — who sends them, how they are delivered through Elixpo Mails, and how your address is protected.",
    alternates: { canonical: "/email-policy" },
    openGraph: {
        title: "Email policy | Elixpo Pay",
        description:
            "Elixpo Pay sends only transactional email. No marketing, and your address is never sold or shared.",
        url: "https://payouts.elixpo.com/email-policy",
    },
};

export default function EmailPolicyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
