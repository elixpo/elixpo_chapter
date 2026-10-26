import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign in to Elixpo",
    description:
        "Sign in to your Elixpo account with email, Google, GitHub, Microsoft, Discord, or a passkey. One account for every Elixpo product.",
    alternates: { canonical: "/login" },
    robots: { index: true, follow: true },
    openGraph: {
        type: "website",
        siteName: "Elixpo Accounts",
        locale: "en_US",
        url: "/login",
        title: "Sign in to Elixpo",
        description:
            "One account for every Elixpo product. Sign in with email, Google, GitHub, Microsoft, Discord, or a passkey.",
        images: [
            {
                url: "/og-image.png",
                width: 1280,
                height: 720,
                alt: "Elixpo Accounts",
            },
        ],
    },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
