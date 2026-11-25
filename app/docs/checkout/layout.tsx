import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Checkout sessions",
    description: "Create hosted checkout sessions from your server with Elixpo Pay: UPI, cards, netbanking and autopay mandates through Razorpay.",
    alternates: { canonical: "/docs/checkout" },
    openGraph: { url: "/docs/checkout", title: "Checkout sessions · Elixpo Pay docs", description: "Create hosted checkout sessions from your server with Elixpo Pay: UPI, cards, netbanking and autopay mandates through Razorpay." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
