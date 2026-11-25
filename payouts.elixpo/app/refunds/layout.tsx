import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Refund & Cancellation Policy",
    description:
        "How cancellations and refunds work on Elixpo Pay — subscriptions, duplicate charges, undelivered service, fundraiser contributions, and how refunds return to your original payment method via Razorpay.",
    alternates: { canonical: "/refunds" },
    openGraph: {
        title: "Refund & Cancellation Policy | Elixpo Pay",
        description:
            "Cancellation, refunds, and disputes for subscriptions and fundraiser contributions on Elixpo Pay.",
        url: "https://payouts.elixpo.com/refunds",
    },
};

export default function RefundsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
