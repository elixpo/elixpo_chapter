import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Connect a device",
    description:
        "Approve or deny a sign-in request from a CLI, TV, or other device with your Elixpo account.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
