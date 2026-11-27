import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign-in error",
    description: "Something went wrong while signing in to Elixpo Accounts.",
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
