import type { Metadata } from "next";

// Thank-you pages are personal receipts: never indexed or shown in results.
export const metadata: Metadata = {
    title: "Thank you",
    robots: { index: false, follow: false, nocache: true },
};

export default function ThanksLayout({ children }: { children: React.ReactNode }) {
    return children;
}
