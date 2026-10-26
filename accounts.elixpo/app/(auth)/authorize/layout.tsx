import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Authorize application",
    description:
        "Review what an application is asking for and choose which Elixpo account to continue with.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
