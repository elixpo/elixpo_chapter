import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";

export const metadata: Metadata = {
    title: {
        default: "Dashboard",
        template: "%s · Dashboard | Elixpo Accounts",
    },
    description:
        "Manage your Elixpo account, OAuth applications, connected services, and webhooks.",
    robots: { index: false, follow: false },
};

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardShell>{children}</DashboardShell>;
}
