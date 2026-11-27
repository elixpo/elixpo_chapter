/**
 * Razorpay Route linked-account onboarding (v2 Accounts API).
 *
 *   1. POST  /v2/accounts                          → acc_…   (the creator's sub-account)
 *   2. POST  /v2/accounts/:id/stakeholders         → owner + PAN (KYC)
 *   3. POST  /v2/accounts/:id/products             → acc_prd_… (Route product, T&C accepted)
 *   4. PATCH /v2/accounts/:id/products/:pid        → settlement bank account
 *
 * Razorpay then reviews the details; transfers are only made once the product's
 * activation_status is "activated". Each step is resumable: the caller persists
 * the account / product ids as soon as they exist, so a retry continues from the
 * failed step instead of creating a duplicate account.
 *
 * Route must be enabled on the platform's Razorpay account (Dashboard → Route);
 * until it is, step 1 fails with "Access Denied".
 */

import type { RazorpayProvider } from "./providers/razorpay";

export type PayoutPurpose = "fundraising" | "selling";

export interface OnboardingInput {
    email: string;
    phone: string; // 10-digit Indian mobile
    name: string; // account holder, as on PAN and bank account
    pan: string; // owner's personal PAN (4th letter P)
    street: string;
    city: string;
    state: string;
    postalCode: string; // 6 digits
    purpose: PayoutPurpose;
    accountNumber: string;
    ifsc: string;
}

export interface OnboardingState {
    accountId: string | null;
    productId: string | null;
}

export interface OnboardingResult extends OnboardingState {
    activationStatus: string | null; // requested | needs_clarification | under_review | activated | suspended
    error: string | null;
    requirements: string[];
}

export const PAN_RE = /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/;
export const PHONE_RE = /^[6-9]\d{9}$/;
export const PIN_RE = /^[1-9]\d{5}$/;

const PROFILE: Record<PayoutPurpose, { category: string; subcategory: string }> = {
    fundraising: { category: "not_for_profit", subcategory: "personal" },
    selling: { category: "it_and_software", subcategory: "saas" },
};

function errText(json: any, fallback: string): string {
    return String(json?.error?.description || fallback).slice(0, 300);
}

function requirementsOf(json: any): string[] {
    const reqs = Array.isArray(json?.requirements) ? json.requirements : [];
    return reqs
        .map((r: any) => String(r?.description || r?.field_reference || r?.reason_code || ""))
        .filter(Boolean)
        .slice(0, 10);
}

/** Run (or resume) onboarding. Never throws; returns how far it got. */
export async function onboardLinkedAccount(
    rzp: RazorpayProvider,
    input: OnboardingInput,
    state: OnboardingState,
): Promise<OnboardingResult> {
    let { accountId, productId } = state;
    const out = (activationStatus: string | null, error: string | null, requirements: string[] = []): OnboardingResult => ({
        accountId,
        productId,
        activationStatus,
        error,
        requirements,
    });
    const address = {
        street: input.street,
        city: input.city,
        state: input.state.toUpperCase(),
        postal_code: input.postalCode,
        country: "IN",
    };

    if (!accountId) {
        const r = await rzp.call("POST", "/v2/accounts", {
            email: input.email,
            phone: input.phone,
            type: "route",
            legal_business_name: input.name,
            customer_facing_business_name: input.name,
            business_type: "individual",
            contact_name: input.name,
            profile: {
                ...PROFILE[input.purpose],
                addresses: {
                    registered: {
                        street1: input.street.slice(0, 100),
                        street2: input.city.slice(0, 100),
                        city: input.city,
                        state: address.state,
                        postal_code: input.postalCode,
                        country: "IN",
                    },
                },
            },
        });
        if (!r.ok || !r.json?.id) return out(null, errText(r.json, `Could not create the payout account (${r.status})`));
        accountId = String(r.json.id);

        const s = await rzp.call("POST", `/v2/accounts/${accountId}/stakeholders`, {
            name: input.name,
            email: input.email,
            phone: { primary: input.phone },
            kyc: { pan: input.pan },
            addresses: { residential: address },
        });
        if (!s.ok) return out(null, errText(s.json, `Could not add your KYC details (${s.status})`));
    }

    if (!productId) {
        const p = await rzp.call("POST", `/v2/accounts/${accountId}/products`, {
            product_name: "route",
            tnc_accepted: true,
        });
        if (!p.ok || !p.json?.id) return out(null, errText(p.json, `Could not enable payouts (${p.status})`));
        productId = String(p.json.id);
    }

    return setSettlementAccount(rzp, { accountId, productId }, input);
}

/** Add or change the bank account Razorpay settles this creator to. */
export async function setSettlementAccount(
    rzp: RazorpayProvider,
    state: { accountId: string; productId: string },
    bank: { accountNumber: string; ifsc: string; name: string },
): Promise<OnboardingResult> {
    const u = await rzp.call("PATCH", `/v2/accounts/${state.accountId}/products/${state.productId}`, {
        settlements: {
            account_number: bank.accountNumber,
            ifsc_code: bank.ifsc,
            beneficiary_name: bank.name,
        },
        tnc_accepted: true,
    });
    if (!u.ok) {
        return {
            ...state,
            activationStatus: null,
            error: errText(u.json, `Could not add your bank account (${u.status})`),
            requirements: [],
        };
    }
    return {
        ...state,
        activationStatus: String(u.json?.activation_status || "requested"),
        error: null,
        requirements: requirementsOf(u.json),
    };
}

/** Current Route activation status of a linked account's product. */
export async function fetchActivation(
    rzp: RazorpayProvider,
    state: { accountId: string; productId: string },
): Promise<{ activationStatus: string | null; requirements: string[] }> {
    const r = await rzp.call("GET", `/v2/accounts/${state.accountId}/products/${state.productId}`);
    if (!r.ok) return { activationStatus: null, requirements: [] };
    return { activationStatus: String(r.json?.activation_status || ""), requirements: requirementsOf(r.json) };
}

/** Our payout_accounts.status for a Route activation status. */
export function statusFor(activationStatus: string | null): "active" | "pending" | "disabled" {
    if (activationStatus === "activated") return "active";
    if (activationStatus === "suspended") return "disabled";
    return "pending";
}
