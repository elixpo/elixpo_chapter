import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Reset your password",
    description: "Reset the password for your Elixpo account.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
