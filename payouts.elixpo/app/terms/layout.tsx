import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Terms of Service",
    description:
        "The terms governing use of Elixpo Pay — payments through Razorpay, subscriptions, fundraisers, payouts via Razorpay Route with a 5% all-in fee, refunds, emails, and liability.",
    alternates: { canonical: "/terms" },
    openGraph: {
        title: "Terms of Service | Elixpo Pay",
        description:
            "Terms governing Elixpo Pay's payments, fundraisers and payouts.",
        url: "https://payouts.elixpo.com/terms",
    },
};

export default function TermsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
