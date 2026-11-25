import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
    title: "Catalog sync",
    description: "Manage products and prices from code with Elixpo Pay's catalog sync API — monthly and yearly, INR and USD, never trusted from the client.",
    alternates: { canonical: "/docs/catalog" },
    openGraph: { url: "/docs/catalog", title: "Catalog sync · Elixpo Pay docs", description: "Manage products and prices from code with Elixpo Pay's catalog sync API — monthly and yearly, INR and USD, never trusted from the client." },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
