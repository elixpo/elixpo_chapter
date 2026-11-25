/**
 * Subscriptions, billing lifecycle, usage metering, and plan limit enforcement.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { newId } from "./ids";
import {
    type BillingCycle,
    type Currency,
    PLANS,
    type PlanDefinition,
    type PlanId,
    getPlan,
    getPlanLimits,
} from "./plans";

export interface TenantSubscription {
    tenantId: string;
    tenantName: string;
    plan: PlanId;
    planDefinition: PlanDefinition;
    billingCycle: BillingCycle;
    billingCurrency: Currency;
    subscriptionStatus: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    /** "elixpo_pay" once the workspace has paid; null on the free plan. */
    paymentProvider: "elixpo_pay" | null;
}

export interface TenantUsage {
    sendsUsed: number;
    sendsLimit: number | null;
    overSendLimit: boolean;
    productsUsed: number;
    productsLimit: number | null;
    sendersUsed: number;
    sendersLimit: number | null;
    templatesUsed: number;
    templatesLimit: number | null;
    periodStart: string;
    periodEnd: string;
}

export interface InvoiceRow {
    id: string;
    tenant_id: string;
    provider: string;
    provider_invoice_id: string | null;
    amount: number;
    currency: string;
    status: string;
    paid_at: string | null;
    pdf_url: string | null;
    hosted_invoice_url: string | null;
    created_at: string;
}

export interface InvoiceInput {
    id?: string;
    tenantId: string;
    provider: "elixpo_pay";
    providerInvoiceId?: string | null;
    amount: number;
    currency: Currency;
    status: "paid" | "open" | "void" | "uncollectible";
    paidAt?: string | null;
    pdfUrl?: string | null;
    hostedInvoiceUrl?: string | null;
}

/** Formats start of current month in UTC (YYYY-MM-01 00:00:00). */
function defaultPeriodStart(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01T00:00:00.000Z`;
}

/** Formats end of current month in UTC. */
function defaultPeriodEnd(): string {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return nextMonth.toISOString();
}

/** Fetch a tenant's subscription state from the database. */
export async function getTenantSubscription(
    db: D1Database,
    tenantId: string,
): Promise<TenantSubscription> {
    const row = (await db
        .prepare(
            `SELECT id, name,
                    COALESCE(plan, 'starter') as plan,
                    COALESCE(billing_cycle, 'monthly') as billing_cycle,
                    COALESCE(billing_currency, 'USD') as billing_currency,
                    COALESCE(subscription_status, 'active') as subscription_status,
                    current_period_start,
                    current_period_end,
                    COALESCE(cancel_at_period_end, 0) as cancel_at_period_end,
                    payment_provider
             FROM tenants WHERE id = ?`,
        )
        .bind(tenantId)
        .first()) as Record<string, unknown> | null;

    const rawPlan = (typeof row?.plan === "string" ? row.plan : "starter") as PlanId;
    const planId: PlanId = rawPlan in PLANS ? rawPlan : "starter";
    const planDefinition = getPlan(planId);

    const rawCycle = (
        typeof row?.billing_cycle === "string" ? row.billing_cycle : "monthly"
    ) as BillingCycle;
    const billingCycle: BillingCycle = rawCycle === "yearly" ? "yearly" : "monthly";

    const rawCurrency = (
        typeof row?.billing_currency === "string" ? row.billing_currency : "USD"
    ) as Currency;
    const billingCurrency: Currency = rawCurrency === "INR" ? "INR" : "USD";

    const rawStatus =
        typeof row?.subscription_status === "string" ? row.subscription_status : "active";
    const subscriptionStatus = ["active", "trialing", "past_due", "canceled", "unpaid"].includes(
        rawStatus,
    )
        ? (rawStatus as TenantSubscription["subscriptionStatus"])
        : "active";

    return {
        tenantId,
        tenantName: typeof row?.name === "string" ? row.name : "Workspace",
        plan: planId,
        planDefinition,
        billingCycle,
        billingCurrency,
        subscriptionStatus,
        currentPeriodStart:
            typeof row?.current_period_start === "string" ? row.current_period_start : null,
        currentPeriodEnd:
            typeof row?.current_period_end === "string" ? row.current_period_end : null,
        cancelAtPeriodEnd: Number(row?.cancel_at_period_end) === 1,
        paymentProvider: row?.payment_provider === "elixpo_pay" ? "elixpo_pay" : null,
    };
}

/** Compute tenant's current usage vs plan allowances. */
export async function getTenantUsage(
    db: D1Database,
    tenantId: string,
    planId: PlanId = "starter",
    periodStart?: string | null,
    periodEnd?: string | null,
): Promise<TenantUsage> {
    const limits = getPlanLimits(planId);
    const startIso = periodStart || defaultPeriodStart();
    const endIso = periodEnd || defaultPeriodEnd();

    // Query deliveries count in period
    const sendsRes = (await db
        .prepare(
            `SELECT COUNT(*) as count FROM deliveries
             WHERE tenant_id = ? AND queued_at >= ?`,
        )
        .bind(tenantId, startIso)
        .first()) as { count?: number } | null;

    // Query products count
    const productsRes = (await db
        .prepare("SELECT COUNT(*) as count FROM products WHERE tenant_id = ?")
        .bind(tenantId)
        .first()) as { count?: number } | null;

    // Query senders count
    const sendersRes = (await db
        .prepare("SELECT COUNT(*) as count FROM senders WHERE tenant_id = ?")
        .bind(tenantId)
        .first()) as { count?: number } | null;

    // Query active templates count
    const templatesRes = (await db
        .prepare(
            "SELECT COUNT(*) as count FROM templates WHERE tenant_id = ? AND status != 'archived'",
        )
        .bind(tenantId)
        .first()) as { count?: number } | null;

    const sendsUsed = Number(sendsRes?.count || 0);
    const productsUsed = Number(productsRes?.count || 0);
    const sendersUsed = Number(sendersRes?.count || 0);
    const templatesUsed = Number(templatesRes?.count || 0);

    const overSendLimit = limits.sendsLimit !== null && sendsUsed >= limits.sendsLimit;

    return {
        sendsUsed,
        sendsLimit: limits.sendsLimit,
        overSendLimit,
        productsUsed,
        productsLimit: limits.productsLimit,
        sendersUsed,
        sendersLimit: limits.sendersLimit,
        templatesUsed,
        templatesLimit: limits.templatesLimit,
        periodStart: startIso,
        periodEnd: endIso,
    };
}

/** List invoice records for a tenant. */
export async function listInvoices(db: D1Database, tenantId: string): Promise<InvoiceRow[]> {
    const res = await db
        .prepare("SELECT * FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50")
        .bind(tenantId)
        .all();
    return (res.results || []) as unknown as InvoiceRow[];
}

/** Record a new invoice row. */
export async function recordInvoice(db: D1Database, data: InvoiceInput): Promise<string> {
    const id = data.id || newId("invoice");
    await db
        .prepare(
            `INSERT INTO invoices (
                id, tenant_id, provider, provider_invoice_id,
                amount, currency, status, paid_at, pdf_url, hosted_invoice_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            id,
            data.tenantId,
            data.provider,
            data.providerInvoiceId || null,
            data.amount,
            data.currency,
            data.status,
            data.paidAt || (data.status === "paid" ? new Date().toISOString() : null),
            data.pdfUrl || null,
            data.hostedInvoiceUrl || null,
        )
        .run();
    return id;
}

export interface SubscriptionUpdates {
    plan?: PlanId;
    billingCycle?: BillingCycle;
    billingCurrency?: Currency;
    subscriptionStatus?: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    paymentProvider?: "elixpo_pay" | null;
}

/** Update subscription fields on a tenant. */
export async function updateTenantSubscription(
    db: D1Database,
    tenantId: string,
    updates: SubscriptionUpdates,
): Promise<void> {
    const sets: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];

    if (updates.plan !== undefined) {
        sets.push("plan = ?");
        values.push(updates.plan);
    }
    if (updates.billingCycle !== undefined) {
        sets.push("billing_cycle = ?");
        values.push(updates.billingCycle);
    }
    if (updates.billingCurrency !== undefined) {
        sets.push("billing_currency = ?");
        values.push(updates.billingCurrency);
    }
    if (updates.subscriptionStatus !== undefined) {
        sets.push("subscription_status = ?");
        values.push(updates.subscriptionStatus);
    }
    if (updates.currentPeriodStart !== undefined) {
        sets.push("current_period_start = ?");
        values.push(updates.currentPeriodStart);
    }
    if (updates.currentPeriodEnd !== undefined) {
        sets.push("current_period_end = ?");
        values.push(updates.currentPeriodEnd);
    }
    if (updates.cancelAtPeriodEnd !== undefined) {
        sets.push("cancel_at_period_end = ?");
        values.push(updates.cancelAtPeriodEnd ? 1 : 0);
    }
    if (updates.paymentProvider !== undefined) {
        sets.push("payment_provider = ?");
        values.push(updates.paymentProvider);
    }

    values.push(tenantId);
    await db
        .prepare(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
}

/** Gating check: can this tenant send emails right now? */
export async function assertCanSend(
    db: D1Database,
    tenantId: string,
): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await getTenantSubscription(db, tenantId);
    // A failing renewal (past_due) does NOT stop sending: the workspace already
    // paid through current_period_end, and blocking would also stop its
    // customers' receipts and password resets. When the period lapses
    // Elixpo Pay's expiry grant moves the workspace to Starter, whose limits
    // then apply below.

    const usage = await getTenantUsage(
        db,
        tenantId,
        sub.plan,
        sub.currentPeriodStart,
        sub.currentPeriodEnd,
    );
    // Hard block on starter when limit reached; paid plans allow sending with soft-cap warnings
    if (sub.plan === "starter" && usage.overSendLimit) {
        return {
            allowed: false,
            reason: "You have reached the monthly limit of 1,000 sends on the free Starter plan. Upgrade to Pro for 25,000 sends.",
        };
    }

    return { allowed: true };
}

/** Gating check: can this tenant create a new product? */
export async function assertCanCreateProduct(
    db: D1Database,
    tenantId: string,
): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await getTenantSubscription(db, tenantId);
    const limits = sub.planDefinition.limits;
    if (limits.productsLimit === null) return { allowed: true };

    const countRes = (await db
        .prepare("SELECT COUNT(*) as count FROM products WHERE tenant_id = ?")
        .bind(tenantId)
        .first()) as { count?: number } | null;
    const current = Number(countRes?.count || 0);

    if (current >= limits.productsLimit) {
        return {
            allowed: false,
            reason: `Your ${sub.planDefinition.name} plan is limited to ${limits.productsLimit} product${
                limits.productsLimit === 1 ? "" : "s"
            }. Upgrade to add more.`,
        };
    }

    return { allowed: true };
}

/** Gating check: can this tenant create a new sender? */
export async function assertCanCreateSender(
    db: D1Database,
    tenantId: string,
): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await getTenantSubscription(db, tenantId);
    const limits = sub.planDefinition.limits;
    if (limits.sendersLimit === null) return { allowed: true };

    const countRes = (await db
        .prepare("SELECT COUNT(*) as count FROM senders WHERE tenant_id = ?")
        .bind(tenantId)
        .first()) as { count?: number } | null;
    const current = Number(countRes?.count || 0);

    if (current >= limits.sendersLimit) {
        return {
            allowed: false,
            reason: `Your ${sub.planDefinition.name} plan is limited to ${limits.sendersLimit} sender${
                limits.sendersLimit === 1 ? "" : "s"
            }. Upgrade to add more.`,
        };
    }

    return { allowed: true };
}

/** Gating check: can this tenant create a new template? */
export async function assertCanCreateTemplate(
    db: D1Database,
    tenantId: string,
): Promise<{ allowed: boolean; reason?: string }> {
    const sub = await getTenantSubscription(db, tenantId);
    const limits = sub.planDefinition.limits;
    if (limits.templatesLimit === null) return { allowed: true };

    const countRes = (await db
        .prepare(
            "SELECT COUNT(*) as count FROM templates WHERE tenant_id = ? AND status != 'archived'",
        )
        .bind(tenantId)
        .first()) as { count?: number } | null;
    const current = Number(countRes?.count || 0);

    if (current >= limits.templatesLimit) {
        return {
            allowed: false,
            reason: `Your ${sub.planDefinition.name} plan is limited to ${limits.templatesLimit} template${
                limits.templatesLimit === 1 ? "" : "s"
            }. Upgrade to add more.`,
        };
    }

    return { allowed: true };
}
