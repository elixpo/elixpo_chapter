// Single switch for every user-facing paid-plan surface (pricing page, upgrade
// CTAs, plan badges, nav/footer pricing links, checkout entry point, sitemap).
//
// OFF unless NEXT_PUBLIC_ENABLE_PAID_PLANS is exactly "true". NEXT_PUBLIC_*
// values are inlined at build time, so changing it requires a rebuild.
//
// This flag only hides UI and the checkout entry point. It deliberately does
// NOT touch the Elixpo Pay webhook (/api/billing/grant), stored tiers, or the
// server-side entitlement checks in lib/tiers.js (getLimits), so any existing tier data
// keeps working exactly as before.
export const PAID_PLANS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAID_PLANS === 'true';
