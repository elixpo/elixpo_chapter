import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Buyer emails",
    description: "Send receipts, cancellation and failed-renewal emails from your own mailbox by connecting Elixpo Pay to Elixpo Mails.",
    alternates: { canonical: "/docs/emails" },
    openGraph: { url: "/docs/emails", title: "Buyer emails · Elixpo Pay docs", description: "Send receipts, cancellation and failed-renewal emails from your own mailbox by connecting Elixpo Pay to Elixpo Mails." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
