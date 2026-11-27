import type { Metadata } from "next";
import Footer from "../components/footer";
import Navbar from "../components/navbar";
import PrivacyContent from "./content";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description:
        "Understand how Elixpo Accounts collects, uses, encrypts, and protects your personal information, active sessions, and client credentials.",
    alternates: { canonical: "/privacy" },
    openGraph: {
        url: "/privacy",
        title: "Privacy Policy — Elixpo Accounts",
        description:
            "Understand how Elixpo Accounts collects, uses, encrypts, and protects your personal information.",
        images: ["/og-image.png"],
    },
};

export default function PrivacyPage() {
    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] flex flex-col justify-between overflow-x-hidden">
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
            `}</style>

            <Navbar />
            <PrivacyContent />
            <Footer />
        </div>
    );
}
