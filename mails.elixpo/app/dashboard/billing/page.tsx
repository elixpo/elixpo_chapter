export const runtime = "edge";

import { getTenantSubscription, getTenantUsage, listInvoices } from "@/lib/billing";
import { getDatabase } from "@/lib/d1-client";
import { requireDashboardSession } from "@/lib/dashboard-session";
import BillingClient from "./BillingClient";

export default async function BillingPage() {
    const session = await requireDashboardSession();
    const db = await getDatabase();
    const subscription = await getTenantSubscription(db, session.tenantId);
    const usage = await getTenantUsage(
        db,
        session.tenantId,
        subscription.plan,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
    );
    const invoices = await listInvoices(db, session.tenantId);

    return (
        <BillingClient
            initialSubscription={subscription}
            initialUsage={usage}
            initialInvoices={invoices}
        />
    );
}
