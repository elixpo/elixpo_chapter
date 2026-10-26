import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Choose your username",
    description: "Pick the username and display name for your Elixpo account.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
