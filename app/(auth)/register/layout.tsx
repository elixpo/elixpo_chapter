import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Create your Elixpo account",
    description:
        "Create a free Elixpo account to use every Elixpo product and to add single sign-on to your own apps.",
    alternates: { canonical: "/register" },
    robots: { index: true, follow: true },
    openGraph: {
        type: "website",
        siteName: "Elixpo Accounts",
        locale: "en_US",
        url: "/register",
        title: "Create your Elixpo account",
        description:
            "One free account for every Elixpo product, and hosted sign-in for your own apps.",
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
