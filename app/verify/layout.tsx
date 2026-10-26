import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Verify your email",
    description:
        "Confirm your email address to finish setting up your Elixpo account.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
