import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Connected payouts",
    description: "Split revenue to creators' KYC-verified bank accounts through Razorpay Route with Elixpo Pay connected payouts.",
    alternates: { canonical: "/docs/payouts" },
    openGraph: { url: "/docs/payouts", title: "Connected payouts · Elixpo Pay docs", description: "Split revenue to creators' KYC-verified bank accounts through Razorpay Route with Elixpo Pay connected payouts." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
