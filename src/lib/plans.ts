export type PlanId = "starter" | "pro" | "scale" | "enterprise";
export type BillingCycle = "monthly" | "yearly";
export type Currency = "USD" | "INR";

export interface PlanPricing {
    amount: number; // in base units (e.g. 19 for $19, 1499 for ₹1499)
    yearlyAmount: number; // in base units
    formattedMonthly: string;
    formattedYearly: string;
    effectiveMonthly: string; // yearly divided by 12 formatted
    currencySymbol: string;
}

export interface PlanLimits {
    sendsLimit: number | null; // null = unlimited / custom
    productsLimit: number | null;
    sendersLimit: number | null;
    templatesLimit: number | null;
    logsRetentionDays: number;
    support: string;
    secretRotation?: boolean;
}

export interface PlanDefinition {
    id: PlanId;
    name: string;
    blurb: string;
    popular?: boolean;
    limits: PlanLimits;
    pricing: Record<Currency, PlanPricing>;
    features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
    starter: {
        id: "starter",
        name: "Starter",
        blurb: "Everything you need to ship your first transactional emails.",
        limits: {
            sendsLimit: 1_000,
            productsLimit: 1,
            sendersLimit: 1,
            templatesLimit: 5,
            logsRetentionDays: 7,
            support: "Community",
        },
        pricing: {
            USD: {
                amount: 0,
                yearlyAmount: 0,
                formattedMonthly: "$0",
                formattedYearly: "$0",
                effectiveMonthly: "$0",
                currencySymbol: "$",
            },
            INR: {
                amount: 0,
                yearlyAmount: 0,
                formattedMonthly: "₹0",
                formattedYearly: "₹0",
                effectiveMonthly: "₹0",
                currencySymbol: "₹",
            },
        },
        features: [
            "1 product",
            "5 templates",
            "1 sender",
            "1,000 sends / month",
            "7-day delivery logs",
            "Community support",
        ],
    },
    pro: {
        id: "pro",
        name: "Pro",
        blurb: "For growing teams sending real transactional volume.",
        popular: true,
        limits: {
            sendsLimit: 25_000,
            productsLimit: 10,
            sendersLimit: 5,
            templatesLimit: null,
            logsRetentionDays: 30,
            support: "Email",
            secretRotation: true,
        },
        pricing: {
            USD: {
                amount: 19,
                yearlyAmount: 190,
                formattedMonthly: "$19",
                formattedYearly: "$190",
                effectiveMonthly: "$15.83",
                currencySymbol: "$",
            },
            INR: {
                amount: 1499,
                yearlyAmount: 14990,
                formattedMonthly: "₹1,499",
                formattedYearly: "₹14,990",
                effectiveMonthly: "₹1,249",
                currencySymbol: "₹",
            },
        },
        features: [
            "10 products",
            "Unlimited templates",
            "5 senders",
            "25,000 sends / month",
            "30-day delivery logs",
            "Secret rotation",
            "Email support",
        ],
    },
    scale: {
        id: "scale",
        name: "Scale",
        blurb: "High-volume sending with priority support and an SLA.",
        limits: {
            sendsLimit: 250_000,
            productsLimit: null,
            sendersLimit: null,
            templatesLimit: null,
            logsRetentionDays: 90,
            support: "Priority support & SLA",
            secretRotation: true,
        },
        pricing: {
            USD: {
                amount: 99,
                yearlyAmount: 990,
                formattedMonthly: "$99",
                formattedYearly: "$990",
                effectiveMonthly: "$82.50",
                currencySymbol: "$",
            },
            INR: {
                amount: 7999,
                yearlyAmount: 79990,
                formattedMonthly: "₹7,999",
                formattedYearly: "₹79,990",
                effectiveMonthly: "₹6,665",
                currencySymbol: "₹",
            },
        },
        features: [
            "Unlimited products",
            "Unlimited senders",
            "250,000 sends / month",
            "90-day delivery logs",
            "Priority support",
            "Uptime SLA",
        ],
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        blurb: "Custom send volume, dedicated support, and tailored terms.",
        limits: {
            sendsLimit: null,
            productsLimit: null,
            sendersLimit: null,
            templatesLimit: null,
            logsRetentionDays: 365,
            support: "Dedicated 24/7 SLA",
            secretRotation: true,
        },
        pricing: {
            USD: {
                amount: 0,
                yearlyAmount: 0,
                formattedMonthly: "Custom",
                formattedYearly: "Custom",
                effectiveMonthly: "Custom",
                currencySymbol: "$",
            },
            INR: {
                amount: 0,
                yearlyAmount: 0,
                formattedMonthly: "Custom",
                formattedYearly: "Custom",
                effectiveMonthly: "Custom",
                currencySymbol: "₹",
            },
        },
        features: [
            "Custom send volume",
            "Unlimited products & senders",
            "Custom log retention",
            "Dedicated Slack channel",
            "Custom contract & SLA",
            "SOC 2 compliance report",
        ],
    },
};

export function getPlan(planId: string | null | undefined): PlanDefinition {
    if (!planId || !(planId in PLANS)) return PLANS.starter;
    return PLANS[planId as PlanId];
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
    return getPlan(planId).limits;
}

export function formatPrice(planId: PlanId, cycle: BillingCycle, currency: Currency): string {
    const plan = PLANS[planId];
    if (!plan) return "$0";
    if (plan.id === "enterprise") return "Custom";
    const pricing = plan.pricing[currency] || plan.pricing.USD;
    return cycle === "yearly" ? pricing.effectiveMonthly : pricing.formattedMonthly;
}

export function getYearlySavingsBadge(): string {
    return "Save ~17% (2 months free)";
}
